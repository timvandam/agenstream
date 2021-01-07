import { EventEmitter } from 'events'

export default class RemoteControlAsyncIterable<T> implements AsyncIterable<T> {
	// Symbol used to the the iterable
	private static readonly end: unique symbol = Symbol('end')

	private readonly chunks: ChunkQueueElement<T | typeof RemoteControlAsyncIterable.end>[] = []
	private readonly events: RemoteControlAsyncIterableEvents = new EventEmitter()

	/**
	 * Make the async iterator yield something
	 * @param thing Thing to yield
	 * @returns Promise that resolves once this yield has been consumed
	 */
	public yield(thing: T): Promise<void> {
		return this.enqueueChunk(thing)
	}

	/**
	 * Ends the iterable
	 * @returns Promise that resolves once the iterator has closed
	 */
	public end(): Promise<void> {
		return this.enqueueChunk(RemoteControlAsyncIterable.end)
	}

	/**
	 * Puts a chunk in the chunk queue and emits an event to indicate it.
	 * @param chunk The chunk or End symbol to add to the queue
	 * @returns Promise that resolves once the enqueued chunk has been consumed
	 * @private
	 */
	private enqueueChunk(chunk: T | typeof RemoteControlAsyncIterable.end): Promise<void> {
		return new Promise((resolve) => {
			this.chunks.push([chunk, resolve])
			this.events.emit('chunk')
		})
	}

	/**
	 * TODO: Don't apply .shift() here to allow for multiple iterators
	 */
	private get chunk(): Promise<ChunkQueueElement<T | typeof RemoteControlAsyncIterable.end>> {
		return new Promise((resolve) => {
			// Return the latest chunk and remove it from the queue
			const ret = () => resolve(this.chunks.shift() as ChunkQueueElement<T | typeof RemoteControlAsyncIterable.end>)

			// If there are chunks in the queue then return those
			if (this.chunks.length) return ret()

			// No chunks in the queue? Wait for the next one
			this.events.once('chunk', ret)
		})
	}

	async *[Symbol.asyncIterator](): AsyncGenerator<T> {
		while (true) {
			const [chunk, callback] = await this.chunk
			if (chunk === RemoteControlAsyncIterable.end) {
				callback()
				break
			}
			yield chunk
			callback()
		}
	}
}

interface RemoteControlAsyncIterableEvents {
	once(eventName: 'chunk', callback: () => void): this
	emit(eventName: 'chunk'): boolean
}

type Callback = () => void
type ChunkQueueElement<T> = [T, Callback]
