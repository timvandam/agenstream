import { Duplex, DuplexOptions, Readable, Writable } from 'readable-stream'
import RemoteControlledAsyncIterable from './RemoteControlledAsyncIterable'

type AGConstructor<P, T = never> = P extends undefined
	? () => AsyncGenerator<T, void, void>
	: (input: P) => AsyncGenerator<T, void, void>

export type ReadableConstructor<O> = AGConstructor<undefined, O>
export type WritableConstructor<I, O = never> = AGConstructor<AsyncIterable<I>, O>
export type DuplexConstructor<I, O> = WritableConstructor<I, O>

export function readable<I>(generator: ReadableConstructor<I>): Readable {
	return Readable.from(generator()) as Readable
}

export function writable<I>(generator: WritableConstructor<I>): Writable {
	return _toWritable(generator, Writable)
}

export function duplex<I, O>(generator: DuplexConstructor<I, O>): Duplex {
	return _toWritable(generator, Duplex) as Duplex
}

type OmitFirst<A extends any[]> = A extends [any, ...infer R] ? R : never
type GetValueOrDefault<O, K, D = never> = K extends keyof O ? O[K] : D
type Pipe<F, L, I extends [F, ...any[]], O extends any[] = OmitFirst<I>> = {
	[K in keyof I]: DuplexConstructor<I[K], GetValueOrDefault<O, K, L>>
}

export function pipe<F, L, P extends [any, ...any[]]>(
	source: ReadableConstructor<F>,
	pipeThrough: Pipe<F, L, P>,
	pipeTo: WritableConstructor<L>
): Writable {
	let tail = readable(source)
	pipeThrough.forEach((dp) => (tail = tail.pipe(duplex(dp))))
	return tail.pipe(writable(pipeTo))
}

function _toWritable<I, O>(
	generator: WritableConstructor<I, O>,
	Constructor: typeof Writable | typeof Duplex = Writable
): InstanceType<typeof Constructor> {
	const input = new RemoteControlledAsyncIterable<I>()
	const w = generator(input[Symbol.asyncIterator]())

	const writable = new Constructor(<DuplexOptions>{
		objectMode: true,
		async write(chunk: I, encoding: BufferEncoding | string, callback: (error?: Error | null) => void) {
			await input.yield(chunk)
			callback()
		},
		async final(callback: (error?: Error | null) => void) {
			await input.end()
			callback()
		},
		/**
		 * Support for readable end of a duplex stream
		 */
		async read(this: Duplex) {
			let go = true
			while (go) {
				const { done, value } = await w.next()
				if (done) {
					this.push(null)
					break
				}
				go = this.push(value)
			}
		},
	})

	/**
	 * If this stream is not a duplex stream then pull flow towards the sink.
	 * A duplex stream would do this whenever being read. Writable is not read so we can just instantly start it.
	 */
	if (Constructor !== Duplex) w.next()

	return writable
}

async function* source() {
	yield 'hello'
	yield 'world'
	yield* ['a', 'b']
}

async function* transform(input: AsyncIterable<string>) {
	for await (const x of input) yield [...x].reduce((x, y) => x + y.charCodeAt(0), 0)
}

async function* transform2(input: AsyncIterable<number>) {
	for await (const x of input) yield (x / 2 + 1).toString()
}

async function* sink(input: AsyncIterable<string>) {
	for await (const x of input) console.log(x)
}

pipe(source, [transform, transform2], sink)

// readable(source).pipe(duplex(transform)).pipe(duplex(transform2)).pipe(writable(sink))
