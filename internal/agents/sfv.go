package agents

import (
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
)

// A minimal RFC 9651 structured-field parser and serializer: enough for
// Signature-Input, Signature and Signature-Agent. Headers over maxHeader
// bytes are refused before parsing.

const maxHeader = 4 << 10

var (
	errSFV      = errors.New("malformed structured field")
	errTooLong  = errors.New("header over 4 KB")
	errSFVEmpty = errors.New("empty structured field")
)

// sfKind is the type of a bare item.
type sfKind uint8

const (
	sfInt sfKind = iota + 1
	sfDecimal
	sfString
	sfToken
	sfBytes
	sfBool
)

type sfItem struct {
	kind sfKind
	s    string // string, token, or the decimal's text
	i    int64
	b    []byte
	t    bool
}

type sfParam struct {
	key string
	val sfItem
}

type sfInner struct {
	item   sfItem
	params []sfParam
}

// sfMember is one dictionary member: an item or an inner list, with parameters.
type sfMember struct {
	key    string
	inner  bool
	item   sfItem
	list   []sfInner
	params []sfParam
}

func (m sfMember) param(key string) (sfItem, bool) { return findParam(m.params, key) }

func findParam(ps []sfParam, key string) (sfItem, bool) {
	for _, p := range ps {
		if p.key == key {
			return p.val, true
		}
	}
	return sfItem{}, false
}

type sfParser struct {
	s   string
	pos int
}

func (p *sfParser) eof() bool { return p.pos >= len(p.s) }
func (p *sfParser) peek() byte {
	if p.eof() {
		return 0
	}
	return p.s[p.pos]
}

func (p *sfParser) skipSP() {
	for !p.eof() && p.s[p.pos] == ' ' {
		p.pos++
	}
}

func (p *sfParser) skipOWS() {
	for !p.eof() && (p.s[p.pos] == ' ' || p.s[p.pos] == '\t') {
		p.pos++
	}
}

// parseDictionary parses an RFC 9651 dictionary. Later duplicate keys win.
func parseDictionary(s string) ([]sfMember, error) {
	if len(s) > maxHeader {
		return nil, errTooLong
	}
	p := &sfParser{s: strings.Trim(s, " \t")}
	if p.eof() {
		return nil, errSFVEmpty
	}
	out := []sfMember{}
	for !p.eof() {
		key, err := p.key()
		if err != nil {
			return nil, err
		}
		m := sfMember{key: key}
		if p.peek() == '=' {
			p.pos++
			if p.peek() == '(' {
				m.inner = true
				if m.list, err = p.innerList(); err != nil {
					return nil, err
				}
			} else if m.item, err = p.bareItem(); err != nil {
				return nil, err
			}
		} else {
			m.item = sfItem{kind: sfBool, t: true}
		}
		if m.params, err = p.params(); err != nil {
			return nil, err
		}
		replaced := false
		for i := range out {
			if out[i].key == key {
				out[i], replaced = m, true
			}
		}
		if !replaced {
			out = append(out, m)
		}
		p.skipOWS()
		if p.eof() {
			break
		}
		if p.peek() != ',' {
			return nil, errSFV
		}
		p.pos++
		p.skipOWS()
		if p.eof() {
			return nil, errSFV // trailing comma
		}
	}
	return out, nil
}

// parseItem parses a whole field as one item with parameters.
func parseItem(s string) (sfItem, []sfParam, error) {
	if len(s) > maxHeader {
		return sfItem{}, nil, errTooLong
	}
	p := &sfParser{s: strings.Trim(s, " \t")}
	if p.eof() {
		return sfItem{}, nil, errSFVEmpty
	}
	it, err := p.bareItem()
	if err != nil {
		return sfItem{}, nil, err
	}
	ps, err := p.params()
	if err != nil || !p.eof() {
		return sfItem{}, nil, errSFV
	}
	return it, ps, nil
}

func (p *sfParser) innerList() ([]sfInner, error) {
	p.pos++ // (
	out := []sfInner{}
	for !p.eof() {
		p.skipSP()
		if p.peek() == ')' {
			p.pos++
			return out, nil
		}
		it, err := p.bareItem()
		if err != nil {
			return nil, err
		}
		ps, err := p.params()
		if err != nil {
			return nil, err
		}
		out = append(out, sfInner{item: it, params: ps})
		if c := p.peek(); c != ' ' && c != ')' {
			return nil, errSFV
		}
	}
	return nil, errSFV
}

func (p *sfParser) params() ([]sfParam, error) {
	out := []sfParam{}
	for p.peek() == ';' {
		p.pos++
		p.skipSP()
		key, err := p.key()
		if err != nil {
			return nil, err
		}
		val := sfItem{kind: sfBool, t: true}
		if p.peek() == '=' {
			p.pos++
			if val, err = p.bareItem(); err != nil {
				return nil, err
			}
		}
		replaced := false
		for i := range out {
			if out[i].key == key {
				out[i].val, replaced = val, true
			}
		}
		if !replaced {
			out = append(out, sfParam{key: key, val: val})
		}
	}
	return out, nil
}

func isLCAlpha(c byte) bool { return c >= 'a' && c <= 'z' }
func isDigit(c byte) bool   { return c >= '0' && c <= '9' }

func (p *sfParser) key() (string, error) {
	start := p.pos
	if c := p.peek(); !isLCAlpha(c) && c != '*' {
		return "", errSFV
	}
	for !p.eof() {
		c := p.s[p.pos]
		if !isLCAlpha(c) && !isDigit(c) && c != '_' && c != '-' && c != '.' && c != '*' {
			break
		}
		p.pos++
	}
	return p.s[start:p.pos], nil
}

func (p *sfParser) bareItem() (sfItem, error) {
	switch c := p.peek(); {
	case c == '-' || isDigit(c):
		return p.number()
	case c == '"':
		return p.str()
	case c == ':':
		return p.bytes()
	case c == '?':
		p.pos++
		switch p.peek() {
		case '0', '1':
			v := p.peek() == '1'
			p.pos++
			return sfItem{kind: sfBool, t: v}, nil
		}
		return sfItem{}, errSFV
	case c == '*' || (c >= 'A' && c <= 'Z') || isLCAlpha(c):
		return p.token()
	}
	return sfItem{}, errSFV
}

func (p *sfParser) number() (sfItem, error) {
	start := p.pos
	if p.peek() == '-' {
		p.pos++
	}
	if !isDigit(p.peek()) {
		return sfItem{}, errSFV
	}
	dot := false
	for !p.eof() {
		c := p.s[p.pos]
		if c == '.' && !dot {
			dot = true
		} else if !isDigit(c) {
			break
		}
		p.pos++
	}
	text := p.s[start:p.pos]
	if dot {
		if strings.HasSuffix(text, ".") || len(text) > 17 {
			return sfItem{}, errSFV
		}
		return sfItem{kind: sfDecimal, s: text}, nil
	}
	if len(strings.TrimPrefix(text, "-")) > 15 {
		return sfItem{}, errSFV
	}
	n, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		return sfItem{}, errSFV
	}
	return sfItem{kind: sfInt, i: n}, nil
}

func (p *sfParser) str() (sfItem, error) {
	p.pos++ // "
	var b strings.Builder
	for !p.eof() {
		c := p.s[p.pos]
		p.pos++
		switch {
		case c == '\\':
			if p.eof() {
				return sfItem{}, errSFV
			}
			n := p.s[p.pos]
			if n != '"' && n != '\\' {
				return sfItem{}, errSFV
			}
			b.WriteByte(n)
			p.pos++
		case c == '"':
			return sfItem{kind: sfString, s: b.String()}, nil
		case c < 0x20 || c > 0x7e:
			return sfItem{}, errSFV
		default:
			b.WriteByte(c)
		}
	}
	return sfItem{}, errSFV
}

func (p *sfParser) token() (sfItem, error) {
	start := p.pos
	p.pos++
	for !p.eof() {
		c := p.s[p.pos]
		if c <= 0x20 || c >= 0x7f || strings.IndexByte(`"(),;<=>?@[\]{}`, c) >= 0 {
			break
		}
		p.pos++
	}
	return sfItem{kind: sfToken, s: p.s[start:p.pos]}, nil
}

func (p *sfParser) bytes() (sfItem, error) {
	p.pos++ // :
	end := strings.IndexByte(p.s[p.pos:], ':')
	if end < 0 {
		return sfItem{}, errSFV
	}
	raw := p.s[p.pos : p.pos+end]
	p.pos += end + 1
	b, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		if b, err = base64.RawStdEncoding.DecodeString(raw); err != nil {
			return sfItem{}, errSFV
		}
	}
	return sfItem{kind: sfBytes, b: b}, nil
}

// serialize writes an item in canonical RFC 9651 form.
func (it sfItem) serialize(b *strings.Builder) {
	switch it.kind {
	case sfInt:
		b.WriteString(strconv.FormatInt(it.i, 10))
	case sfDecimal, sfToken:
		b.WriteString(it.s)
	case sfString:
		b.WriteByte('"')
		for i := 0; i < len(it.s); i++ {
			if c := it.s[i]; c == '"' || c == '\\' {
				b.WriteByte('\\')
			}
			b.WriteByte(it.s[i])
		}
		b.WriteByte('"')
	case sfBytes:
		b.WriteByte(':')
		b.WriteString(base64.StdEncoding.EncodeToString(it.b))
		b.WriteByte(':')
	case sfBool:
		if it.t {
			b.WriteString("?1")
		} else {
			b.WriteString("?0")
		}
	}
}

func serializeParams(b *strings.Builder, ps []sfParam) {
	for _, p := range ps {
		b.WriteByte(';')
		b.WriteString(p.key)
		if p.val.kind == sfBool && p.val.t {
			continue
		}
		b.WriteByte('=')
		p.val.serialize(b)
	}
}

// serializeInnerList writes an inner list with its parameters (the
// @signature-params value).
func serializeInnerList(list []sfInner, ps []sfParam) string {
	var b strings.Builder
	b.WriteByte('(')
	for i, in := range list {
		if i > 0 {
			b.WriteByte(' ')
		}
		in.item.serialize(&b)
		serializeParams(&b, in.params)
	}
	b.WriteByte(')')
	serializeParams(&b, ps)
	return b.String()
}
