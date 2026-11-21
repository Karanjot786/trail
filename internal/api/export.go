package api

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"strconv"
	"strings"
	"time"

	"trail/internal/query"
)

var errNoRows = errors.New("this report has no rows to export")

// exportFormat returns "csv" or "json" for ?format=, "" when absent.
func exportFormat(r *http.Request) (string, error) {
	switch f := r.URL.Query().Get("format"); f {
	case "", "csv", "json":
		return f, nil
	default:
		return "", fmt.Errorf("%w: format must be csv or json", errBadRequest)
	}
}

// writeExport sends rows as an attachment named
// trail-{site}-{report}-{fromDay}-{toDay}.{csv|json}. CSV cells that a
// spreadsheet would run as a formula are prefixed with a quote.
func writeExport(w http.ResponseWriter, format, report string, p query.Params, v any) error {
	cols, rows, ok := table(v)
	if !ok {
		return errNoRows
	}
	loc := p.TZ
	if loc == nil {
		loc = time.UTC
	}
	day := func(ms int64) string { return time.UnixMilli(ms).In(loc).Format(time.DateOnly) }
	name := fmt.Sprintf("trail-%s-%s-%s-%s.%s", p.Site, strings.ReplaceAll(report, "/", "-"), day(p.From), day(p.To), format)
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if format == "json" {
		w.Header().Set("Content-Type", "application/json")
		return json.NewEncoder(w).Encode(struct {
			Site    string            `json:"site"`
			Window  query.Window      `json:"window"`
			TZ      string            `json:"tz"`
			Filters map[string]string `json:"filters"`
			Rows    any               `json:"rows"`
		}{p.Site, p.Win, loc.String(), p.Filters, v})
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	cw := csv.NewWriter(w)
	if err := cw.Write(cols); err != nil {
		return err
	}
	for _, row := range rows {
		for i, c := range row {
			row[i] = neutralise(c)
		}
		if err := cw.Write(row); err != nil {
			return err
		}
	}
	cw.Flush()
	return cw.Error()
}

// neutralise stops spreadsheets from running a cell as a formula.
func neutralise(c string) string {
	if c != "" && strings.ContainsRune("=+-@\t\r", rune(c[0])) {
		return "'" + c
	}
	return c
}

// table flattens a slice of structs into a header (json names, in field
// order, embedded structs inlined) and string rows. Nested values become JSON.
func table(v any) ([]string, [][]string, bool) {
	rv := reflect.ValueOf(v)
	if rv.Kind() != reflect.Slice {
		return nil, nil, false
	}
	et := rv.Type().Elem()
	if et.Kind() != reflect.Struct {
		return nil, nil, false
	}
	var cols []string
	var paths [][]int
	var walk func(t reflect.Type, prefix []int)
	walk = func(t reflect.Type, prefix []int) {
		for i := range t.NumField() {
			f := t.Field(i)
			if !f.IsExported() {
				continue
			}
			idx := append(append([]int{}, prefix...), i)
			tag, _, _ := strings.Cut(f.Tag.Get("json"), ",")
			if f.Anonymous && tag == "" && f.Type.Kind() == reflect.Struct {
				walk(f.Type, idx)
				continue
			}
			if tag == "-" {
				continue
			}
			if tag == "" {
				tag = f.Name
			}
			cols = append(cols, tag)
			paths = append(paths, idx)
		}
	}
	walk(et, nil)
	rows := make([][]string, rv.Len())
	for i := range rv.Len() {
		row := make([]string, len(paths))
		for j, p := range paths {
			row[j] = cell(rv.Index(i).FieldByIndex(p))
		}
		rows[i] = row
	}
	return cols, rows, true
}

func cell(v reflect.Value) string {
	for v.Kind() == reflect.Pointer || v.Kind() == reflect.Interface {
		if v.IsNil() {
			return ""
		}
		v = v.Elem()
	}
	switch v.Kind() {
	case reflect.String:
		return v.String()
	case reflect.Bool:
		return strconv.FormatBool(v.Bool())
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		return strconv.FormatInt(v.Int(), 10)
	case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
		return strconv.FormatUint(v.Uint(), 10)
	case reflect.Float32, reflect.Float64:
		return strconv.FormatFloat(v.Float(), 'f', -1, 64)
	}
	b, _ := json.Marshal(v.Interface())
	return string(b)
}
