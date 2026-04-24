# MERN 60-Minute Refresher (Debugging-Focused)

> Built for the case where you'll be handed an existing MERN codebase with broken pieces to fix, and an AI assistant on the side. The goal isn't to teach MERN from zero — it's to **reload** the parts of your brain you used a year ago, with enough explanation that nothing feels like a magic incantation, and the **bug patterns** that coding challenges love.

**How to read this doc**

The first pass is meant to take about an hour. Each section has:

1. **Why it matters** (1 sentence)
2. **Definitions** (the jargon, in plain English)
3. **Syntax patterns** (what the shape of the code is, not just the code)
4. **Code examples** with annotations
5. **Common bugs** to recognize in the challenge

**Time budget for a re-read on the day of the challenge**

| Section                              | First read | Re-read |
| ------------------------------------ | ---------- | ------- |
| 1. JavaScript fundamentals           | 15 min     | 5 min   |
| 2. React hooks & re-renders          | 20 min     | 7 min   |
| 3. Node + Express                    | 12 min     | 4 min   |
| 4. MongoDB + Mongoose                | 10 min     | 4 min   |
| 5. Full-stack glue                   |  5 min     | 2 min   |
| 6. Self-check: spot the bug          | 10 min     | quick   |

> Working tip for the challenge itself: read the failing test (or repro steps) **first**, find the file it touches, then form a hypothesis before you start grepping. The AI is fastest when you give it a hypothesis to confirm/deny, not "find the bug for me".

---

## 1. JavaScript fundamentals (15 min)

### 1.1 Equality `==` vs `===`, and truthy/falsy (these are TWO different things)

**Why it matters.** Half of all "weird JS bugs" come from confusing these two ideas. Let's separate them.

**Definitions.**

- **Strict equality (`===`)** compares value *and* type. No conversion happens. `1 === '1'` is `false`.
- **Loose equality (`==`)** does **type coercion**: it converts the two sides to a common type and *then* compares. This is what makes it surprising.
- **Truthy / falsy** is a totally separate concept: it's the rule for when JS treats a value as "true-like" inside an `if`, `&&`, `||`, ternaries, etc.
  - **Falsy values (memorize these 7):** `false`, `0`, `-0`, `0n` (BigInt zero), `''`, `null`, `undefined`, `NaN`.
  - **Everything else is truthy**, including `[]`, `{}`, `"0"`, `"false"`.

**Your question — "if `[]` is truthy, why is `[] == false` true?"**

Because `==` does **not** ask "are both sides truthy?". It runs a coercion algorithm. For `[] == false`:

1. `false` is a boolean. `==` converts booleans to numbers: `false` → `0`. Now we have `[] == 0`.
2. One side is an object (`[]`), the other a number. `==` converts the object to a primitive by calling its `toString()`. `[].toString()` is `''`.
3. Now `'' == 0`. `==` converts the string to a number: `Number('')` is `0`.
4. `0 == 0` → `true`.

So `[]` is truthy in an `if`, but `[] == false` is also true via coercion. They aren't contradictory because they're answering two different questions:

```js
if ([]) console.log('truthy');   // logs 'truthy' — [] is truthy
console.log([] == false);        // true — coercion chain above
console.log([] === false);       // false — different types, no coercion
console.log(Boolean([]));        // true — explicit truthiness check
```

**The rule:** never use `==`. Use `===`. If you want to test "truthy", use `if (x)` or `Boolean(x)`.

```js
// Quirks for reference (you don't need to memorize these — just never use ==)
0 == false          // true
'' == 0             // true
null == undefined   // true   (the only place == is sometimes useful)
null === undefined  // false
NaN == NaN          // false  (NaN never equals anything, even itself)
```

---

### 1.2 `var` / `let` / `const`, scoping, hoisting, closures

**Why it matters.** This is your other question. To explain it you need three concepts: **scope**, **hoisting**, and **closures**. They're worth defining cleanly.

**Definitions.**

- **Scope** = the region of code where a variable is "alive" and accessible.
  - `var` has **function scope**: the variable lives from the top of the enclosing `function` to its end. Blocks like `{ }`, `if`, `for` do **not** make a new scope for `var`.
  - `let` and `const` have **block scope**: the variable lives only inside the nearest `{ }` block (including the body of an `if`, `for`, etc.).
- **Hoisting** = JS conceptually moves declarations to the top of their scope *before* running code. So you can reference a `var`-declared variable above where it's written; it just reads as `undefined` until the assignment line runs. `let`/`const` are also hoisted but accessing them before the declaration line throws (the "Temporal Dead Zone").
- **Closure** = when a function "remembers" the variables from the scope where it was defined, even after that scope has finished running. Every callback you write — `setTimeout`, `addEventListener`, `.map(...)`, React event handlers — is a closure over the variables in the surrounding code.

**Walking through your confusing example.**

```js
for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log(i));   // logs 3, 3, 3
}
for (let i = 0; i < 3; i++) {
  setTimeout(() => console.log(i));   // logs 0, 1, 2
}
```

`setTimeout(fn)` doesn't run `fn` now — it schedules it for **after** the current code finishes. So by the time those callbacks run, the loop is already done.

Why `var` prints `3, 3, 3`:

- `var i` is **function-scoped**, so there is exactly **one `i`** shared by every iteration.
- The loop ends with `i === 3` (because `3 < 3` is false, then it exits).
- All three callbacks are closures over that **same single `i`**. They each look it up when they run, and they all see `3`.

Why `let` prints `0, 1, 2`:

- `let i` is **block-scoped to each iteration** of the `for` loop. JS effectively creates a fresh `i` per iteration.
- Each callback closes over its own iteration's `i`, which never changes again.
- So they print `0`, `1`, `2`.

The syntax `setTimeout(() => console.log(i))` is just:

```js
setTimeout(
  () => {                  // an arrow function (anonymous, defined inline)
    console.log(i);        // the body
  },
  0                        // optional delay in ms, default 0
);
```

Arrow function shape: `(args) => expression` (returns the expression) or `(args) => { statements }` (no implicit return).

**Hoisting demo:**

```js
function f() {
  console.log(x);   // undefined  — `var x` was hoisted, value isn't set yet
  var x = 1;
  console.log(x);   // 1
}

function g() {
  console.log(y);   // ReferenceError — `let` is in the Temporal Dead Zone
  let y = 1;
}
```

**The rule:** use `const` by default, `let` when you need to reassign, **never `var`** in new code.

---

### 1.3 Destructuring & spread

**Why it matters.** You will read these constantly in React/Node code and you'll need to write them without thinking.

**Definition.** **Destructuring** is syntax to *pull values out of objects/arrays into local variables in one line*. **Spread (`...`)** is syntax to *expand* an iterable / object's properties into another array, object, or function call.

```js
// Object destructuring
const user = { name: 'Ada', age: 36, role: 'admin' };

const { name } = user;                  // name === 'Ada'
const { name: who } = user;             // rename: who === 'Ada'
const { country = 'NG' } = user;        // default if missing: country === 'NG'
const { name, ...rest } = user;         // rest === { age: 36, role: 'admin' }

// Array destructuring (positional)
const nums = [10, 20, 30, 40];
const [a, b] = nums;                    // a=10, b=20
const [, , third] = nums;               // skip with empty slots: third=30
const [first, ...others] = nums;        // others === [20, 30, 40]

// Function parameter destructuring (very common in React)
function Greet({ name, age = 0 }) {     // pulls props.name, props.age
  return `${name} is ${age}`;
}

// Spread — copy & merge
const arr2 = [...nums, 50];             // [10, 20, 30, 40, 50]
const obj2 = { ...user, age: 37 };      // later keys win → age becomes 37

// Spread in function calls (instead of f.apply(null, args))
Math.max(...nums);                      // 40
```

**Gotcha:** spread is a **shallow copy**. Nested objects/arrays are still shared by reference.

```js
const a = { inner: { n: 1 } };
const b = { ...a };
b.inner.n = 2;
console.log(a.inner.n);   // 2 — same inner object
```

---

### 1.4 Promises and async / await

**Why it matters.** Almost every bug in a MERN challenge involves an `await` someone forgot.

**Definitions.**

- A **Promise** is a value that represents an async operation that will *eventually* resolve (succeed with a value) or reject (fail with an error).
- `async function` automatically returns a Promise. Inside it, `await p` pauses execution until the Promise `p` settles, then gives you the value (or throws on rejection).
- `await` only works inside `async` functions (and at the top level in modern Node ESM).

**Syntax patterns.**

```js
// Three ways to consume a promise:
fetchUser(id).then(handle).catch(err);           // .then chain
fetchUser(id).then(handle, err);                 // 2-arg .then

async function go() {                            // async/await
  try {
    const user = await fetchUser(id);
    handle(user);
  } catch (err) {
    // handle err
  }
}
```

**Sequential vs parallel.**

```js
// SEQUENTIAL — waits for each one before starting the next
for (const id of ids) {
  await fetchUser(id);
}
// total time ≈ sum of all requests

// PARALLEL — kicks them all off, then waits for all
const users = await Promise.all(ids.map(fetchUser));
// total time ≈ slowest single request
```

**The `forEach` + async trap (very common bug).**

```js
ids.forEach(async (id) => {
  await save(id);             // this Promise is created and thrown away
});
console.log('done');          // logs immediately, before any save finishes
```

`forEach` ignores the return value of its callback, so the `Promise` returned by your `async` callback floats off un-awaited. Fix:

```js
// Parallel
await Promise.all(ids.map((id) => save(id)));

// Sequential
for (const id of ids) {
  await save(id);
}
```

**Error handling.** `try / catch` wraps an `await`. A `Promise` that rejects with no handler becomes an **unhandled promise rejection** — Node logs it and may crash the process; Express won't send a response.

---

### 1.5 Reference vs value (the React state bug factory)

**Definition.** Primitive values (`number`, `string`, `boolean`, `null`, `undefined`, `symbol`, `bigint`) are stored **by value** — assigning copies the value. Objects and arrays are stored **by reference** — assigning copies the *pointer to the same object*.

```js
let a = 1;
let b = a;
b = 2;
console.log(a);   // 1 — independent

const x = { n: 1 };
const y = x;
y.n = 2;
console.log(x.n); // 2 — same object
```

**Why React cares.** React decides whether to re-render by checking `Object.is(prev, next)` on state and props (a shallow reference check). If you **mutate** an array/object and pass back the same reference, React thinks nothing changed.

```js
// ❌ Mutates the existing array, same reference → React may skip render
setItems((items) => { items.push(newItem); return items; });

// ✅ Returns a brand-new array
setItems((items) => [...items, newItem]);

// ❌ Same for objects
setUser((u) => { u.name = 'Ada'; return u; });

// ✅
setUser((u) => ({ ...u, name: 'Ada' }));
```

This is the single most common React bug in coding challenges.

---

### 1.6 Array methods you must know cold

| Method        | What it does                                        | Returns                  | Mutates? |
| ------------- | --------------------------------------------------- | ------------------------ | -------- |
| `map(fn)`     | Transform each element                              | new array, same length   | no       |
| `filter(fn)`  | Keep elements where `fn` returns truthy             | new array, ≤ length      | no       |
| `reduce(fn, init)` | Fold the array into one value                  | a single value           | no       |
| `find(fn)`    | First element where `fn` is truthy, else `undefined`| element or `undefined`   | no       |
| `findIndex(fn)`| Index of first match, else `-1`                    | number                   | no       |
| `some(fn)`    | True if any element matches                         | boolean                  | no       |
| `every(fn)`   | True if all elements match                          | boolean                  | no       |
| `includes(x)` | True if `x` is in the array (uses `===`-ish)        | boolean                  | no       |
| `forEach(fn)` | Run `fn` for side effects                           | `undefined`              | no       |
| `sort(cmp)`   | Sort in place                                       | the **same** array       | **yes**  |
| `splice(i,n)` | Remove/insert in place                              | array of removed items   | **yes**  |
| `push/pop/shift/unshift` | Add/remove ends                          | new length / removed     | **yes**  |

**Pattern: copy then sort** (so you don't mutate React state):

```js
const sorted = [...items].sort((a, b) => a.age - b.age);
```

`sort` returning the same array (and not stringifying numbers correctly without a comparator) is a top-5 sneaky bug:

```js
[10, 2, 30].sort();                       // ['10', '2', '30'] sorted as strings → [10, 2, 30] → [10, 2, 30]?? actually [10, 2, 30] → ["10","2","30"] → sorted lex → [10, 2, 30]. Just always pass a comparator for numbers:
[10, 2, 30].sort((a, b) => a - b);        // [2, 10, 30]
```

---

## 2. React — hooks & re-renders (20 min)

### 2.1 Mental model (read this twice)

- A **component** is a **function** whose job is to take props/state in and return JSX (a description of UI) out.
- React calls that function **every render**. So all the code in the function body runs again. That's why putting "do stuff once" code directly in the body is wrong — you'd do it on every render.
- **Hooks** are special functions (`useState`, `useEffect`, etc.) that React uses to persist values across renders, run side effects, etc. Hooks must be called:
  - **At the top level** of a component (never in `if`, loops, or after early returns).
  - **In the same order** every render (so React can match them by call order).
- A component **re-renders** when any of these change:
  - Its own state (a `useState` setter was called),
  - Its props,
  - Its parent re-rendered (children re-render by default).

**JSX is just sugar.** `<Row item={x} />` becomes `React.createElement(Row, { item: x })`. Curly braces `{}` in JSX means "switch back to JS expressions".

```jsx
function App() {
  const name = 'Ada';
  return (
    <div className="card">           {/* className, not class */}
      <h1>Hello {name}</h1>          {/* {} = JS expression */}
      {isAdmin && <AdminPanel />}    {/* conditional render */}
      {items.map((it) => (           {/* lists need keys */}
        <Row key={it.id} item={it} />
      ))}
    </div>
  );
}
```

---

### 2.2 `useState` — local state

**Definition.** `useState(initial)` returns a tuple `[value, setValue]`. Calling `setValue(x)` schedules a re-render with the new state.

```jsx
const [count, setCount] = useState(0);
//     ^ current      ^ updater  ^ initial value (used only on first render)
```

**Two ways to set state.**

```jsx
setCount(count + 1);            // "replacement" — uses the value captured at render time
setCount((c) => c + 1);         // "functional" — receives the latest state, returns the new
```

The functional form is **always safe** because React passes you the freshest state. Use it in:
- Event handlers that fire fast (clicks, key presses)
- `setTimeout`/`setInterval` callbacks
- After `await` (the captured `count` is stale)

**Batching & async.** Setting state does **not** update the variable in the current function — it just schedules a re-render. So:

```jsx
setCount(count + 1);
console.log(count);             // still the OLD value — variables are immutable per render
```

If you call the replacement form three times with the same captured `count`, you get a single `+1` instead of `+3`:

```jsx
const onClick = () => {
  setCount(count + 1);          // captured count = 0 → schedules 1
  setCount(count + 1);          // schedules 1 again
  setCount(count + 1);          // schedules 1 again
};                              // final: 1, not 3
```

Fix with functional form:

```jsx
const onClick = () => {
  setCount((c) => c + 1);       // 0 → 1
  setCount((c) => c + 1);       // 1 → 2
  setCount((c) => c + 1);       // 2 → 3
};
```

**State must be immutable to React.** See section 1.5 — always pass a *new* object/array.

---

### 2.3 `useEffect` — side effects (this is where most React bugs live)

**Definition.** `useEffect(fn, deps)` runs `fn` **after** the component renders to the DOM. Use it for things outside React: data fetching, subscriptions, timers, DOM manipulation, logging.

**Syntax pattern.**

```jsx
useEffect(() => {
  // 1. effect: runs after render
  const id = setInterval(tick, 1000);

  // 2. cleanup (optional): returned function runs BEFORE the next effect and on unmount
  return () => clearInterval(id);
}, [tick]);
// 3. deps: when does this effect re-run?
//    []          → only after the first render (component mount)
//    [a, b]      → after first render + any render where `a` or `b` changed (Object.is)
//    omitted     → after EVERY render (almost always wrong)
```

**Why deps matter — stale closures.** The function inside `useEffect` is a closure over the variables of the render in which it was created. If you list `[]` as deps, the effect captures the values from the first render and *never sees new ones*.

```jsx
function User({ id }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch(`/api/users/${id}`).then((r) => r.json()).then(setUser);
  }, []);                       // ❌ id changes won't refetch

  // ✅
  useEffect(() => {
    fetch(`/api/users/${id}`).then((r) => r.json()).then(setUser);
  }, [id]);
}
```

**Rule of thumb:** every variable from outside the effect that you use *inside* it should be in the deps array. ESLint's `react-hooks/exhaustive-deps` rule enforces this — listen to it.

**Race condition pattern (any async effect).**

```jsx
useEffect(() => {
  let cancelled = false;        // closed over by both the async fn and cleanup
  (async () => {
    const data = await fetch(`/api/x/${id}`).then((r) => r.json());
    if (!cancelled) setData(data);
  })();
  return () => { cancelled = true; };
}, [id]);
```

Without this, if `id` changes fast (e.g. typing in a search box), the older fetch can resolve *after* the newer one and overwrite it with stale data.

---

### 2.4 Controlled vs uncontrolled inputs

**Definition.**

- **Controlled input:** React owns the value. `<input value={x} onChange={...} />`. The DOM mirrors React state.
- **Uncontrolled input:** the DOM owns the value. `<input defaultValue={x} ref={...} />`. You read it via `ref.current.value`.

**Use controlled** almost always. Common bugs:

```jsx
<input value={name} onChange={(e) => setName(e.target.value)} />
//          ^^^^^                     ^^^^^^^^^^^^^^^^^^^^^^
//          must be defined          read the new value from the event

<input value={undefined} />   // ❌ React warns "controlled → uncontrolled"
<input defaultValue={name} onChange={...} />  // ❌ mixing modes
```

For checkboxes use `checked={bool}` and `e.target.checked`.

---

### 2.5 Lists and keys

**Why keys matter.** React diffs lists by matching elements between renders. The `key` tells React "this is the same item as last time, even if it moved". A wrong key causes React to reuse the wrong DOM/state — input cursor jumps to the wrong row, etc.

```jsx
{items.map((item) => (
  <Row key={item.id} item={item} />
))}
```

**Rules.**

- Use a **stable unique id** from your data (`item.id`, not `Math.random()`).
- The array index is **only OK** if the list is static (never reordered, filtered, or has items added/removed in the middle).
- Keys must be unique among **siblings**, not globally.

---

### 2.6 `useCallback`, `useMemo`, `React.memo` (performance hooks — use sparingly)

**Definitions.**

- `useMemo(fn, deps)` — runs `fn` only when `deps` change, returns the **memoized value**. Use for expensive computations.
- `useCallback(fn, deps)` — same as `useMemo` but specifically for memoizing a **function reference** so it stays stable across renders. Equivalent to `useMemo(() => fn, deps)`.
- `React.memo(Component)` — wraps a component so it skips re-rendering if its props are referentially equal to last render.

```jsx
const Row = React.memo(function Row({ item, onClick }) { ... });

function List({ items }) {
  // Without useCallback this would be a new function every render → React.memo above would be useless
  const onClick = useCallback((id) => doStuff(id), []);
  const total = useMemo(() => items.reduce((s, i) => s + i.value, 0), [items]);

  return <>{items.map((it) => <Row key={it.id} item={it} onClick={onClick} />)}</>;
}
```

**Default:** don't reach for these unless you have a measured perf problem or you're feeding a function/object into a memoized child or a hook's deps array.

---

### 2.7 Context — global-ish state without prop drilling

```jsx
const AuthCtx = createContext(null);                      // create

function App() {
  const [user, setUser] = useState(null);
  return (
    <AuthCtx.Provider value={{ user, setUser }}>          {/* provide */}
      <Page />
    </AuthCtx.Provider>
  );
}

function NavBar() {
  const { user } = useContext(AuthCtx);                   // consume
  return <div>Hi {user?.name}</div>;
}
```

**Gotcha:** every change to the `value` you pass to `Provider` re-renders **all** consumers. If you put fast-changing values in one big context, the whole subtree re-renders constantly. Split into multiple contexts if needed.

---

## 3. Node + Express (12 min)

### 3.1 What is Express, conceptually?

Express is a **request-pipeline framework**. Every incoming HTTP request walks through a chain of **middleware** functions. Each function looks at `req` and `res` and either:

- Sends a response (`res.json(...)`, `res.send(...)`, `res.status(...).end()`),
- Calls `next()` to pass control to the next middleware,
- Calls `next(err)` to skip to error handlers.

**Middleware signature:**

```js
function middleware(req, res, next) { ... }              // 3 args: normal
function errorMiddleware(err, req, res, next) { ... }    // 4 args: error handler
```

Express identifies error handlers by the **4-argument signature**. If you accidentally write 3 args, it won't be treated as an error handler.

---

### 3.2 Minimal Express server, annotated

```js
import express from 'express';
import cors from 'cors';

const app = express();                            // create the app
app.use(cors());                                  // allow cross-origin requests
app.use(express.json());                          // parse JSON bodies → req.body

// Route: METHOD + path + handler(s)
app.get('/api/health', (req, res) => {
  res.json({ ok: true });                         // sets Content-Type: application/json
});

app.post('/api/users', async (req, res, next) => {
  try {
    const user = await User.create(req.body);     // never forget await on DB calls
    res.status(201).json(user);
  } catch (e) {
    next(e);                                      // forward to error middleware
  }
});

// 404 (no route matched). Place AFTER all real routes.
app.use((req, res) => res.status(404).json({ error: 'not found' }));

// Error handler — 4 args. Place LAST.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message });
});

app.listen(3000, () => console.log('http://localhost:3000'));
```

**Middleware order matters.** Express runs middleware in the order you register them. Common required order:

```js
app.use(cors());                  // 1. CORS first
app.use(express.json());          // 2. body parsing before routes that read req.body
app.use('/api', apiRouter);       // 3. real routes
app.use(notFoundHandler);         // 4. catch-all 404
app.use(errorHandler);            // 5. error handler LAST (4 args)
```

---

### 3.3 Common Express bugs

- **`req.body` is `undefined`** → forgot `app.use(express.json())`, or it's registered *after* the route.
- **CORS blocked in browser** → missing `app.use(cors())`, or your `origin` allowlist is wrong.
- **Async handler throws and the request hangs** → no `try/catch`, no `next(err)`. Either wrap in `try/catch` or use a helper like `express-async-handler`.
- **"Cannot set headers after they are sent"** → you called `res.json/send/end` twice, or you didn't `return` after sending a response (so code keeps running and sends again).
- **`res.json(promise)`** → you forgot `await`. Express serializes the Promise as `{}`.

```js
// ❌ classic
app.get('/me', async (req, res) => {
  const user = User.findById(req.user.id);        // missing await
  res.json(user);                                 // serializes a Promise → {}
});
```

---

### 3.4 HTTP status codes worth knowing

| Code | Meaning                  | When                                              |
| ---- | ------------------------ | ------------------------------------------------- |
| 200  | OK                       | Successful GET/PUT                                |
| 201  | Created                  | Successful POST that created a resource           |
| 204  | No Content               | Successful DELETE, or empty PUT                   |
| 400  | Bad Request              | Malformed input, validation failure               |
| 401  | Unauthorized             | Missing/invalid auth credentials                  |
| 403  | Forbidden                | Authenticated but not allowed                     |
| 404  | Not Found                | Resource doesn't exist                            |
| 409  | Conflict                 | Duplicate key, optimistic-locking conflict        |
| 422  | Unprocessable Entity     | Semantically wrong input (alternative to 400)     |
| 500  | Internal Server Error    | Unhandled exception                               |

---

### 3.5 JWT authentication in one breath

**Definition.** A **JWT (JSON Web Token)** is a signed string `header.payload.signature` containing a JSON payload. The server signs it with a secret; the client sends it back on each request, usually in `Authorization: Bearer <token>`. The server *verifies the signature* on each request to trust the payload.

```js
import jwt from 'jsonwebtoken';

// Sign on login
const token = jwt.sign(
  { sub: user.id, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);
res.json({ token });

// Verify in middleware (protect routes)
function auth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'no token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);   // throws on bad/expired
    next();
  } catch {
    res.status(401).json({ error: 'bad token' });
  }
}

app.get('/api/me', auth, (req, res) => {
  res.json({ id: req.user.sub });
});
```

---

## 4. MongoDB + Mongoose (10 min)

### 4.1 The pieces

- **MongoDB** is a document database. Records are JSON-like documents grouped into **collections** (~ tables).
- **Mongoose** is the most popular ODM (Object-Document Mapper) for MongoDB in Node. It adds **schemas**, **validation**, and a nicer query API on top of the raw driver.

**Workflow:**

1. Define a **schema** describing the shape of documents.
2. Compile it into a **model** (e.g. `User`).
3. Use the model to CRUD documents.

### 4.2 Schema & model

```js
import mongoose from 'mongoose';
const { Schema } = mongoose;

const UserSchema = new Schema({
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  name:      { type: String, required: true },
  age:       { type: Number, min: 0 },
  roles:     { type: [String], default: ['user'] },        // array of strings
  createdAt: { type: Date, default: Date.now },            // pass the function, not Date.now()
});

// "User" → MongoDB collection "users" (Mongoose pluralizes/lowercases)
export const User = mongoose.model('User', UserSchema);
```

**Important field options:**

- `required: true` — must be present
- `unique: true` — creates a unique index (enforced by Mongo; a duplicate insert throws an error with code `11000`)
- `default: ...` — used if the field is missing
- `enum: [...]` — restrict to a fixed set
- `ref: 'OtherModel'` — for population (joining)

### 4.3 CRUD cheat sheet

```js
// CREATE
await User.create({ email, name });
const u = new User({ email, name }); await u.save();

// READ
await User.find({ roles: 'admin' }).limit(20).sort({ createdAt: -1 }).lean();
await User.findById(id);                          // by _id
await User.findOne({ email });                    // first match
await User.countDocuments({ active: true });

// UPDATE
await User.findByIdAndUpdate(id, { name }, { new: true, runValidators: true });
//                                            ^ return updated doc, not original
//                                                     ^ run schema validators on update
await User.updateOne({ _id: id }, { $set: { name } });

// DELETE
await User.findByIdAndDelete(id);
await User.deleteMany({ archived: true });
```

`.lean()` returns plain JS objects instead of Mongoose documents — faster and lighter, but you lose `doc.save()`, virtuals, etc. Use it for read-only endpoints.

### 4.4 Query operators

```js
{ age: { $gt: 18, $lte: 30 } }       // > 18 and ≤ 30
{ name: { $regex: /^al/i } }         // regex
{ roles: { $in: ['admin', 'mod'] } } // value in array
{ tags:  { $all: ['js', 'mern'] } }  // array contains all
{ $or:  [{ a: 1 }, { b: 2 }] }       // OR clause
{ deletedAt: { $exists: false } }    // field missing
```

### 4.5 Update operators (use inside `$set`-style updates)

```js
{ $set:       { x: 1, 'nested.field': 2 } }       // set fields
{ $inc:       { views: 1 } }                      // increment number
{ $push:      { tags: 'new' } }                   // append to array
{ $pull:      { tags: 'old' } }                   // remove matching from array
{ $addToSet:  { tags: 'unique' } }                // append if not present
```

### 4.6 Common Mongoose bugs

- **Forgot `await`** on `create/find/update/delete` → handler responds before the DB op finishes.
- **`findByIdAndUpdate` returns the old doc** unless `{ new: true }` is passed.
- **Validators don't run on update** unless `{ runValidators: true }`.
- **`_id` comparisons:** `doc._id` is an `ObjectId`, not a string. Use `String(doc._id) === id` or `doc._id.equals(id)`.
- **Duplicate key error** (`E11000`) needs to be mapped to a 409 in the error handler, otherwise it surfaces as a generic 500.
- **`.lean()` then trying `.save()`** — you can't, it's a plain object.
- **Forgot to connect** — `await mongoose.connect(process.env.MONGO_URI)` at startup, and listen for errors.

```js
await mongoose.connect(process.env.MONGO_URI);
mongoose.connection.on('error', console.error);
```

### 4.7 Population (joining)

```js
const PostSchema = new Schema({
  title:  String,
  author: { type: Schema.Types.ObjectId, ref: 'User' },
});

// In a query:
const post = await Post.findById(id).populate('author', 'name email');
// post.author is now the full User doc (or just the projected fields)
```

---

## 5. Full-stack glue (5 min)

### 5.1 `fetch` on the client

```js
const res = await fetch('/api/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ name }),                 // must be a string
});

if (!res.ok) {                                    // fetch only throws on network errors
  throw new Error(`${res.status} ${await res.text()}`);
}
const data = await res.json();
```

**Gotchas.**

- `fetch` **does not throw on 4xx/5xx**. Always check `res.ok` (true for 2xx) before calling `res.json()`.
- Forgetting `Content-Type: application/json` → server sees an empty body.
- `body` must be a **string** (`JSON.stringify(obj)`), not the object itself.
- Mixing absolute (`http://localhost:5000/api/...`) and relative (`/api/...`) URLs while a dev proxy is configured leads to mysterious CORS surprises. Pick one.

### 5.2 Environment variables

Where to put `FOO_API_KEY`?

- **Server (Node):** `process.env.FOO_API_KEY`. Loaded from a `.env` file via `dotenv`, or natively in newer Node (`node --env-file=.env`). Never committed.
- **Client (Create React App):** `process.env.REACT_APP_FOO_API_KEY`. Must be prefixed `REACT_APP_`.
- **Client (Vite):** `import.meta.env.VITE_FOO_API_KEY`. Must be prefixed `VITE_`.

**Never put secrets in client env vars** — they end up bundled into the JS sent to the browser.

### 5.3 CORS in development

CORS = browser-enforced restriction that scripts on origin A can't read responses from origin B unless B says so via headers. Two ways to make local dev painless:

1. **Enable `cors()` on the API** and call absolute URLs from the client (`http://localhost:5000/api/...`).
2. **Use a dev proxy** (Vite `server.proxy`, CRA `"proxy"` in `package.json`) so the client calls relative URLs (`/api/...`) and the dev server forwards them to the API. The browser sees same-origin and CORS doesn't apply.

Pick one. Mixing them is the source of half of all "works on my machine" bugs.

---

## 6. Self-check — spot the bug (10 min)

Read each snippet, decide what's wrong, **then** scroll to the answers. Aim for 8/10. Under that = re-skim the matching section above.

---

**Q1.** Why doesn't the counter end at 3?

```jsx
function Counter() {
  const [n, setN] = useState(0);
  const onClick = () => {
    setN(n + 1);
    setN(n + 1);
    setN(n + 1);
  };
  return <button onClick={onClick}>{n}</button>;
}
```

---

**Q2.** Why does this effect refetch on every render?

```jsx
useEffect(() => {
  fetch('/api/items', { headers: { ...defaultHeaders } }).then(setItems);
}, [{ ...defaultHeaders }]);
```

---

**Q3.** What's wrong with this Express handler?

```js
app.post('/api/users', (req, res) => {
  User.create(req.body).then((user) => res.json(user));
});
```

---

**Q4.** Why does the response come back as `{}`?

```js
app.get('/api/me', async (req, res) => {
  const user = User.findById(req.user.id);
  res.json(user);
});
```

---

**Q5.** Why does this list misbehave when you delete a row?

```jsx
{items.map((item, i) => (
  <Row key={i} item={item} onDelete={() => remove(item.id)} />
))}
```

---

**Q6.** Why does the API return the old document?

```js
const updated = await User.findByIdAndUpdate(id, req.body);
res.json(updated);
```

---

**Q7.** What's the bug?

```js
async function saveAll(items) {
  items.forEach(async (item) => {
    await db.save(item);
  });
  console.log('done');
}
```

---

**Q8.** Why is `req.body` undefined?

```js
const app = express();
app.post('/api/x', (req, res) => res.json(req.body));
app.listen(3000);
```

---

**Q9.** Why does `setUser` sometimes set stale data?

```jsx
useEffect(() => {
  fetch(`/api/users/${id}`).then((r) => r.json()).then(setUser);
}, [id]);
```

---

**Q10.** Why is the client throwing `Unexpected token < in JSON`?

```js
const res = await fetch('/api/users');
const data = await res.json();
```

---

### Answers

1. All three `setN(n + 1)` calls capture the same `n = 0`, so they all schedule the same value (`1`). Final state is `1`, not `3`. Fix: `setN((n) => n + 1)` — the functional form receives the latest pending state.
2. The dep array contains a **new object literal `{ ...defaultHeaders }` every render**. React compares deps with `Object.is`, which returns `false` for two different object references → the effect re-runs every render. Fix: list the primitive deps individually, or memoize the object with `useMemo`.
3. The Promise can reject and nothing handles it → unhandled rejection, request hangs, Express never sends a response. Fix: use `async/await` with `try/catch` and call `next(err)` on failure.
4. Missing `await`. `User.findById(...)` returns a `Promise`; serializing a Promise yields `{}`. Fix: `const user = await User.findById(req.user.id)`.
5. Using the array index as `key`. When you delete row 0, React thinks "row 0 still exists, just with different content" and reuses the wrong DOM/state (e.g. an open menu or focused input attaches to the wrong row). Fix: `key={item.id}`.
6. `findByIdAndUpdate` returns the **pre-update** document by default. Pass `{ new: true }` (and usually `{ runValidators: true }`) to get the updated doc.
7. `forEach` doesn't await async callbacks, so `'done'` logs immediately, all the saves fire in parallel, and errors are swallowed. Fix: `await Promise.all(items.map((i) => db.save(i)))` for parallel, or a `for...of` with `await` for sequential.
8. Missing `app.use(express.json())` before the route, so Express never parses the JSON body.
9. Race condition. If `id` changes faster than the network responds, the older fetch can resolve **after** the newer one and overwrite it with stale data. Fix: cancel-on-unmount via a `cancelled` flag, or use `AbortController`.
10. `fetch` doesn't throw on non-2xx. The server probably returned HTML (a 404 page or dev-server fallthrough), and `res.json()` is choking on the leading `<`. Fix: `if (!res.ok) throw new Error(await res.text());` before `res.json()`.

---

## Strategy for the challenge itself

1. **Skim the repo structure first** (1–2 min). Find `package.json` scripts, the entry points (client `App.jsx`/`main.jsx`, server `index.js`/`server.js`), and the data layer (`models/`, `schemas/`).
2. **Read the failing requirement, then the failing file** — don't drift into "interesting" code that isn't on the path to the bug.
3. **Form a hypothesis before you read more code.** Then ask the AI: "Here's snippet X and the failure Y — is my hypothesis Z correct?" Concrete questions get concrete answers.
4. **Reproduce locally** before fixing. A change without a confirmed repro is a guess.
5. **Smallest possible diff.** Coding challenges grade on signal, not heroics. Don't refactor unrelated code.
6. **Save a few minutes at the end** to re-run all listed test cases / scenarios in one pass.

**Common challenge bug archetypes** (in roughly the order you'll meet them):

- Missing `await` somewhere in an Express route.
- Stale closure / missing dep in a `useEffect`.
- Mutating state instead of returning a new object/array.
- Wrong key in a list, or `value`/`defaultValue` confusion.
- `findByIdAndUpdate` without `{ new: true }`.
- Missing `express.json()` / CORS / auth header.
- `fetch` not checking `res.ok`.
- Index/uniqueness constraint not enforced where the test expects 409.
- Off-by-one in pagination (`skip = (page - 1) * limit`).
- Date comparison with strings instead of `Date` objects.

Good luck. Read the question twice, write the code once.
