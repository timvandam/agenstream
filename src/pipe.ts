import { Duplex, DuplexOptions, Readable, Writable } from 'readable-stream'
import { EventEmitter } from 'events'

type AGConstructor<P, T = never> = P extends undefined
	? () => AsyncGenerator<T, void, void>
	: (input: P) => AsyncGenerator<T, void, void>

export type ReadableConstructor<O> = AGConstructor<undefined, O>
export type WritableConstructor<I, O = never> = AGConstructor<ReturnType<ReadableConstructor<I>>, O>

export function readable<I>(generator: ReadableConstructor<I>): Readable {
	return Readable.from(generator()) as Readable
}

export function writable<I>(generator: WritableConstructor<I>): Writable {
	return _toWritable(generator, Writable)
}

export function duplex<I, O>(generator: WritableConstructor<I, O>): Duplex {
	return _toWritable(generator, Duplex) as Duplex
}

function _toWritable<I, O>(
	generator: WritableConstructor<I, O>,
	Constructor = Writable
): InstanceType<typeof Constructor> {
	const chunks: [I, Function][] = []
	const chunkListener = new EventEmitter()
	const waitForChunk = () =>
		new Promise<void>((resolve) => {
			if (chunks.length) return resolve()
			chunkListener.once('chunk', resolve)
		})

	const input = (async function* (): AsyncGenerator<I, void, void> {
		while (true) {
			await waitForChunk()
			if (!chunks.length) return
			const [chunk, callback] = chunks[0]
			chunks.shift()
			yield chunk
			callback()
		}
	})()
	const w = generator(input)

	const options: DuplexOptions = {
		objectMode: true,
		write(chunk: I, encoding: BufferEncoding | string, callback: (error?: Error | null) => void) {
			chunks.push([chunk, callback])
			chunkListener.emit('chunk')
		},
		final(this: Writable, callback: (error?: Error | null) => void) {
			chunkListener.emit('chunk')
			callback()
		},
	}

	if (Constructor === Duplex) {
		options.read = async function (this: Duplex) {
			let go = true
			while (go) {
				const { done, value } = await w.next()
				if (done) {
					this.push(null)
					break
				}
				go = this.push(value)
			}
		}
	} else w.next()

	return new Constructor(options)
}

async function* source() {
	yield 'hello'
	yield 'world'
	yield* ['a', 'b']
}

async function* transform(input: AsyncGenerator<string>) {
	for await (const x of input) yield x.toUpperCase()
}

async function* sink(input: AsyncGenerator<string>) {
	for await (const x of input) console.log(x)
}

readable(source).pipe(duplex(transform)).pipe(writable(sink))
// TODO: Method to pipe many after each other, auto wrapping the generators
