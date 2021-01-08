import { duplex, DuplexConstructor, readable, ReadableConstructor, writable, WritableConstructor } from './stream'
import { Writable } from 'readable-stream'

export type OmitFirst<T extends any[]> = T extends [any, ...infer R] ? R : never
export type GetValueOrDefault<Thing, Key, Default = never> = Key extends keyof Thing ? Thing[Key] : Default
export type Pipe<Start, Finish, Inputs extends [Start, ...any[]], Outputs extends any[] = OmitFirst<Inputs>> = {
	[I in keyof Inputs]: DuplexConstructor<Inputs[I], GetValueOrDefault<Outputs, I, Finish>>
}

export function pipe<F, L, P extends [F, ...any[]]>(
	...streams: [ReadableConstructor<F>, ...Pipe<F, L, P>, WritableConstructor<L>]
): Writable {
	const source = streams[0]
	const duplexes = streams.slice(1, -1) as Pipe<F, L, P>
	const sink = streams[streams.length - 1] as WritableConstructor<L>

	let tail = readable(source)
	duplexes.forEach((dp) => (tail = tail.pipe(duplex(dp))))
	return tail.pipe(writable(sink))
}
