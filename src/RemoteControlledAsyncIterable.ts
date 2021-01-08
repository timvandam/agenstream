import { EventEmitter } from 'events'

/**
 * Class that can be used
 */
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
		return this.enqueue(thing)
	}

	/**
	 * Ends the iterable
	 * @returns Promise that resolves once the iterator has closed
	 */
	public end(): Promise<void> {
		return this.enqueue(RemoteControlledAsyncIterable.end)
	}

	/**
	 * Emits an event indicating that all queues must add this element to the queue
	 * @param element The element or end symbol to add to the queue
	 * @returns Promise that resolves once the enqueued element has been consumed
	 */
	private enqueue(element: T | typeof RemoteControlledAsyncIterable.end): Promise<void> {
		return new Promise((resolve) => {
			this.events.emit('element', [element, resolve])
		})
	}

	/**
	 * Returns a promise that resolves when there is an element available.
	 * @private
	 */
	private get elementIsAvailable(): Promise<void> {
		return new Promise((resolve) => {
			this.events.once('element', () => resolve())
		})
	}

	async *[Symbol.asyncIterator](): AsyncGenerator<T> {
		// Keep track of the element queue here. (this can't be done in the class as multiple iterations might happen)
		const queue: QueueEntry<T | typeof RemoteControlledAsyncIterable.end>[] = []
		const populateQueue: ElementListener<T | typeof RemoteControlledAsyncIterable.end> = (entry) => queue.push(entry)
		this.events.on('element', populateQueue)

		while (true) {
			// Wait until a new element is available
			if (!queue.length) await this.elementIsAvailable
			// Handle an element
			const [element, resolve] = queue.shift() as QueueEntry<T | typeof RemoteControlledAsyncIterable.end>
			if (element === RemoteControlledAsyncIterable.end) {
				resolve()
				break
			}
			yield element
			resolve()
		}
		this.events.off('element', populateQueue)
	}
}

interface RemoteControlAsyncIterableEvents<T> {
	once(eventName: 'element', listener: ElementListener<T>): this
	on(eventName: 'element', listener: ElementListener<T>): this
	emit(eventName: 'element', params: QueueEntry<T>): boolean
	off(eventName: 'element', listener: ElementListener<T>): this
}

type ElementListener<T> = (entry: QueueEntry<T>) => void
type Resolve = () => void
type QueueEntry<T> = [element: T, resolve: Resolve]
