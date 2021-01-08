# agenstream
Node.js Streams using Async Generators

## Examples
### Using pipe()
```ts
import { pipe } from 'agenstream'

// Stream data from somewhere
async function* source() {
	yield 'a'
	yield 'b'
	yield 'c'
}

// Do something with the data
async function* transform(input: AsyncIterable<string>) {
	for await (const x of input) yield x.charCodeAt(0)
}

// Use the transformed data for something
async function* sink(input: AsyncIterable<number>) {
	let result = 0
	for await (const x of input) result += x
	console.log(result)
}

pipe(source, transform, sink)
```

### Transforming an async generator into a stream
```ts
import { stream } from 'agenstream'

// Stream data from somewhere
async function* source() {
	yield 'a'
	yield 'b'
	yield 'c'
}
stream.readable(source) // creates a Readable stream


// Do something with the data
async function* transform(input: AsyncIterable<string>) {
	for await (const x of input) yield x.charCodeAt(0)
}
stream.duplex(transform) // creates a Duplex stream

// Use the transformed data for something
async function* sink(input: AsyncIterable<number>) {
	let result = 0
	for await (const x of input) result += x
	console.log(result)
}
stream.writable(sink) // creates a Writable stream

```
