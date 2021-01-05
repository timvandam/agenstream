import { Duplex, DuplexOptions, Readable, Writable, WritableOptions } from 'readable-stream'
import { EventEmitter } from 'events'

type AGConstructor<P, T = never> = P extends undefined ? () => AsyncGenerator<T> : (input: P) => AsyncGenerator<T>

export type ReadableConstructor<O> = AGConstructor<undefined, O>
export type WritableConstructor<I, O = never> = AGConstructor<ReturnType<ReadableConstructor<I>>, O>

function toReadable<I>(generator: ReadableConstructor<I>): Readable {
	return Readable.from(generator()) as Readable
}

function toWritable<I>(generator: WritableConstructor<I>): Writable {
	return _toWritable(generator, Writable)
}

function toDuplex<I, O>(generator: WritableConstructor<I, O>): Duplex {
	return _toWritable(generator, Duplex) as Duplex
}

function _toWritable<I, O>(
	generator: WritableConstructor<I, O>,
	Constructor = Writable
): InstanceType<typeof Constructor> {
	const chunks: [I, Function][] = []
	const chunkListener = new EventEmitter()
	const chunkIsAvailable = () =>
		new Promise<void>((resolve) => {
			if (chunks.length) return resolve()
			chunkListener.once('chunk', resolve)
		})

	const w = generator(
		(async function* (): AsyncGenerator<I, void, void> {
			while (true) {
				await chunkIsAvailable()
				const [chunk, callback] = chunks[0]
				chunks.shift()
				yield chunk
				callback()
			}
		})()
	)

	const options: DuplexOptions = {
		objectMode: true,
		write(chunk: I, encoding: BufferEncoding | string, callback: (error?: Error | null) => void) {
			chunkListener.emit('chunk')
			chunks.push([chunk, callback])
		},
	}

	if (Constructor === Duplex) {
		options.read = async function (this: Duplex) {
			let go = true
			while (go) {
				const { done, value } = await w.next()
				if (done) break
				go = this.push(value)
			}
		}
	} else w.next()

	return new Constructor(options)
}

const r = toReadable(async function* () {
	yield 'hello'
	yield 'world'
})

const w = toDuplex<string, string>(async function* (r) {
	for await (const x of r) yield x.toUpperCase()
})

const z = toWritable(async function* (r) {
	for await (const x of r) console.log(x)
})

r.pipe(w).pipe(z)
