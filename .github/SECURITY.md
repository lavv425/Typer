# Security Policy

Typer is input-validation code. It is usually the first thing a payload from
the outside touches, so a hole in it is a hole in whatever sits behind it. This
document says how to report one, and what Typer does and does not claim to
defend against.

## Supported versions

| Version | Supported |
| --- | --- |
| 5.0.x | ✅ |
| 4.1.x | ⚠️ security fixes only |
| 4.0.x | ❌ |
| ≤ 3.x | ❌ |

Only the latest minor of a supported major receives fixes. Please upgrade
before reporting a problem you can reproduce only on an older release.

### Known issue in 4.1.1

A schema slot whose type string is `constructor` accepts **any** value:

```js
safeParse({ role: 'constructor' }, { role: anything })   // success: true in 4.1.1
```

Alias names were resolved through an ordinary object, so `constructor` found
`Object.prototype.constructor` by inheritance and was treated as a registered
type. The slot then validated nothing. Fixed in 5.0, where alias lookup uses
null-prototype maps and the same schema reports `unknown_type`.

Reaching it requires the *schema* to name a slot `constructor`, so it is not
exploitable through payload data alone. It matters where schemas are built at
runtime from configuration or user input — which `checkStructure` documents as
a supported use — because there the schema is attacker-influenced.

If you cannot upgrade to 5.0, avoid building schemas from untrusted input.

## Reporting a vulnerability

**Do not open a public issue.**

Report through GitHub's private vulnerability reporting, on the
[Security tab](https://github.com/lavv425/Typer/security/advisories/new) of
this repository. That channel is private between you and the maintainer, and
lets a fix be prepared before anything is public.

A useful report has:

- the version you reproduced on;
- a minimal schema and payload, ideally runnable;
- what you expected, and what happened instead;
- what an attacker gains — a bypass, a crash, a pollution, something else.

### What to expect

Typer is maintained by one person, so these are honest intentions rather than a
guaranteed service level:

| | |
| --- | --- |
| First response | within a week |
| Assessment and plan | within two weeks of the first response |
| Fix for a confirmed issue | in the next patch release |

You will be credited in the advisory and the changelog unless you ask not to be.
If a report turns out to be a non-issue you will get the reasoning, not silence.

## What Typer defends against

These are guarantees, and a failure of one is a vulnerability worth reporting:

- **A `success` result means the value matched the schema.** Every declared key
  is present and of the declared type, and — since 5.0, by default — no
  undeclared key survives.
- **Prototype-polluting keys do not pass.** `__proto__`, `constructor` and
  `prototype` are stripped from validated objects unless the schema declares
  them as fields of its own. Typer validates in place and hands back the same
  reference, so leaving them would arm the first downstream spread,
  `Object.assign` or ORM update. Where the object is frozen and a key cannot be
  removed, validation fails with `dangerous_key` rather than returning an
  object it could not make safe.
- **Combinators that build objects do not reintroduce them.** `record()` builds
  a new object, where `out['__proto__'] = value` would set the result's
  prototype instead of a field; it drops those keys.
- **Validation does not execute schema content.** A schema is data. The one
  exception is opt-in and named below.
- **Error messages do not leak the offending value.** Constraint failures report
  the bound and the measurement, not the input. The value is available on the
  issue's `value` field for callers that want it, and is deliberately omitted
  from the Standard Schema output, which frameworks tend to log whole.

## What Typer does not defend against

Reports about these are welcome as bugs, but they are not vulnerabilities in
Typer:

- **It validates shape, not safety.** `isString` accepts `<script>alert(1)</script>`
  because that is a string. Escaping for HTML, SQL, shell or a filesystem path
  is the job of whatever consumes the value.
- **`isURL` and `isEmail` say "well-formed", not "safe" or "reachable".** A URL
  that passes may still point anywhere, including at your own network. SSRF
  defence is an allowlist, not a format check.
- **Custom validators and aliases are your code.** Typer calls them; what they
  do is yours. An alias that returns instead of throwing accepts everything.
- **Denial of service through pathological input size.** Typer walks what you
  give it. Bound the request body before it reaches validation.
- **The `Typer` class is not a sandbox.** `registerType` mutates the instance
  it is called on; sharing one instance across trust boundaries shares its
  aliases.

## Generated code and Content-Security-Policy

`@illavv/run_typer/jit` compiles schemas with `new Function`, which requires
`unsafe-eval`. This is why it is a separate entry point rather than the
default: every other entry point contains no `new Function`, `eval` or dynamic
import, so a consumer who does not import `/jit` is unaffected by that policy.

The generated source is built from the schema you supply. Schema **values** —
bounds, predicates, delegated validators — are never written into the source;
they are passed in as bindings and referenced by index. Only key names and type
strings reach the text, each through `JSON.stringify`, except a key that
matches `/^[A-Za-z_$][A-Za-z0-9_$]*$/` in full, which is emitted as a property
access after a dot because that pattern cannot terminate the expression.

Still, a schema built from untrusted input is untrusted input reaching a code
generator: do not do that, with or without `/jit`.

Where `new Function` is refused, `compile` falls back to the closure compiler
and reports `generated: false`. Behaviour is identical.

## Regular expressions

The format validators use anchored regular expressions without nested
unbounded quantifiers. Measured against adversarial inputs from 500 to 4000
characters, `isEmail`, `isPhoneNumber`, `isSemver` and `isSlug` show no growth
in match time with input length. If you find an input where one of them does
grow superlinearly, that is a vulnerability — please report it.

## Dependencies

Typer has one runtime dependency, `tslib`, which is TypeScript's own helper
library. Everything else is a devDependency and is not published. The `files`
field limits the package to `dist` and `src`.

## Code of Conduct

Security reporting is covered by the project's
[Code of Conduct](CODE_OF_CONDUCT.md).
