export interface Page<T> {
  items: T[]
  index: number
  count: number
  from: number
  to: number
  total: number
}
