import { Duplex, DuplexOptions, Readable, Writable } from 'readable-stream'
import RemoteControlledAsyncIterable from './RemoteControlledAsyncIterable'

export type AsyncGeneratorConstructor<Param, Yield = never> = Param extends undefined
	? () => AsyncGenerator<Yield, void, void>
	: (input: Param) => AsyncGenerator<Yield, void, void>

export type ReadableConstructor<O> = AsyncGeneratorConstructor<undefined, O>
export type WritableConstructor<I> = AsyncGeneratorConstructor<AsyncIterable<I>>
export type DuplexConstructor<I, O> = AsyncGeneratorConstructor<AsyncIterable<I>, O>

export function readable<I>(generator: ReadableConstructor<I>): Readable {
	return Readable.from(generator()) as Readable
}

export function writable<I>(generator: WritableConstructor<I>): Writable {
	return _toWritable(generator, Writable)
}

export function duplex<I, O>(generator: DuplexConstructor<I, O>): Duplex {
	return _toWritable(generator, Duplex) as Duplex
}

function _toWritable<I, O>(
	generator: WritableConstructor<I> | DuplexConstructor<I, O>,
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