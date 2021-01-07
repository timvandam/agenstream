import { EventEmitter } from 'events'

export default class RemoteControlledAsyncIterable<T> implements AsyncIterable<T> {
	// Symbol used to the the iterable
	private static readonly end: unique symbol = Symbol('end')

	private readonly events: RemoteControlAsyncIterableEvents<
		T | typeof RemoteControlledAsyncIterable.end
	> = new EventEmitter()

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
		return this.enqueueChunk(RemoteControlledAsyncIterable.end)
	}

	/**
	 * Emits an event indicating that all chunk queues must add this chunk to the queue
	 * @param chunk The chunk or End symbol to add to the queue
	 * @returns Promise that resolves once the enqueued chunk has been consumed
	 */
	private enqueueChunk(chunk: T | typeof RemoteControlledAsyncIterable.end): Promise<void> {
		return new Promise((resolve) => {
			this.events.emit('chunk', [chunk, resolve])
		})
	}

	/**
	 * Returns a promise that resolves when there is a chunk available.
	 * @private
	 */
	private get chunkIsAvailable(): Promise<void> {
		return new Promise((resolve) => {
			this.events.once('chunk', () => resolve())
		})
	}

	async *[Symbol.asyncIterator](): AsyncGenerator<T> {
		// Keep a local copy of the chunk queue to allow
		const chunkQueue: ChunkQueueElement<T | typeof RemoteControlledAsyncIterable.end>[] = []
		const populateChunkQueue: ChunkListener<T | typeof RemoteControlledAsyncIterable.end> = (chunk) =>
			chunkQueue.push(chunk)
		this.events.on('chunk', populateChunkQueue)

		while (true) {
			// Wait until there are chunks available
			if (!chunkQueue.length) await this.chunkIsAvailable
			// Handle the chunks
			const [chunk, callback] = chunkQueue.shift() as ChunkQueueElement<T | typeof RemoteControlledAsyncIterable.end>
			if (chunk === RemoteControlledAsyncIterable.end) {
				callback()
				break
			}
			yield chunk
			callback()
		}
		this.events.off('chunk', populateChunkQueue)
	}
}

interface RemoteControlAsyncIterableEvents<T> {
	once(eventName: 'chunk', listener: ChunkListener<T>): this
	on(eventName: 'chunk', listener: ChunkListener<T>): this
	emit(eventName: 'chunk', params: ChunkQueueElement<T>): boolean
	off(eventName: 'chunk', listener: ChunkListener<T>): this
}

type ChunkListener<T> = (chunk: ChunkQueueElement<T>) => void
type Callback = () => void
type ChunkQueueElement<T> = [chunk: T, callback: Callback]
