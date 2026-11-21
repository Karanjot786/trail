package query

// Actors. is_bot=1 marks every row that is not a person (bots and AI agents); a non-empty
// agent column marks the agents among them. People metrics stay people only unless the request asks
// for actor=all, which adds the agents (never the other bots).
const (
	ActorHuman = "human"
	ActorAll   = "all"
)

// actorCond is the row condition over events alias for p's actor. Both results are built
// from compile-time constants and the caller's alias (also a constant), never user input.
func actorCond(p Params, alias string) string {
	if p.Actor == ActorAll {
		return "(" + alias + ".is_bot=0 OR " + alias + ".agent<>'')"
	}
	return alias + ".is_bot=0"
}

// journeyCond keeps a person's own rows whether they are a person or an AI agent: a journey
// is one actor's history, so it never mixes the two. Visitors' visit totals use it too, so a
// row and its journey agree.
const journeyCond = "(e.is_bot=0 OR e.agent<>'')"

// peopleOnly is the actor condition of reports that never include agents (Live, online now,
// the main purchase currency).
func peopleOnly(alias string) string { return actorCond(Params{}, alias) }
