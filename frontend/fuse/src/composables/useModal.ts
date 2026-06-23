import { ref, shallowRef } from 'vue'

export interface ModalButtonOptions {
  label?: string
  variant?: 'primary' | 'secondary' | 'tertiary'
  fill?: string
  stroke?: string
  color?: string
}

export interface ModalOptions {
  header?: string
  description?: string
  cancel?: ModalButtonOptions
  confirm?: ModalButtonOptions
}

type ModalResolve = (value: boolean) => void

const visible = ref(false)
const options = shallowRef<ModalOptions>({})
let resolve: ModalResolve | null = null

function confirm(opts: ModalOptions = {}): Promise<boolean> {
  options.value = opts
  visible.value = true
  return new Promise<boolean>((res) => {
    resolve = res
  })
}

function accept() {
  visible.value = false
  resolve?.(true)
  resolve = null
}

function reject() {
  visible.value = false
  resolve?.(false)
  resolve = null
}

export function useModal() {
  return { visible, options, confirm, accept, reject }
}
