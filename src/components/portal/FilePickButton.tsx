'use client'

import { useRef } from 'react'
import { Button, type ButtonProps } from '@/components/system'

export interface FilePickButtonProps extends Omit<ButtonProps, 'onClick' | 'type'> {
  /** What the picker offers, as the `accept` attribute takes it: `.csv,text/csv`. */
  accept: string
  /** The chosen file. Called once per choice, including the same file chosen again. */
  onFile: (file: File) => void
}

/**
 * A Button that opens the browser's file picker.
 *
 * A native file picker can only be opened by a file input, and a file input
 * cannot be styled into a control that looks and behaves like the others — so
 * every screen that takes a file used to carry its own hidden input, its own
 * ref, and its own reset-the-value trick, and each was one more raw control for
 * the hub's tests to make an exception for. This is that pattern, once.
 *
 * The input is `hidden`, never focusable and named by nothing: the Button is
 * the control people see, tab to and hear announced. Its value is cleared after
 * each choice so picking the same file again — the usual move after fixing it
 * in a spreadsheet — still fires.
 */
export function FilePickButton({ accept, onFile, children, ...button }: FilePickButtonProps) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onFile(file)
        }}
      />
      <Button {...button} onClick={() => input.current?.click()}>
        {children}
      </Button>
    </>
  )
}

/**
 * A chosen file's text.
 *
 * Through `FileReader` rather than `file.text()`, which some embedded browsers
 * (and older test environments) still lack.
 */
export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that file.'))
    reader.readAsText(file)
  })
}
