import { useEffect, useState } from 'react'

interface Props {
  value: string
  onCommit: (value: string) => void
  align?: 'left' | 'right'
  placeholder?: string
  className?: string
  title?: string
}

/** A table cell input that saves when you press Enter or leave the cell. Esc cancels. */
export function EditCell({ value, onCommit, align = 'left', placeholder, className, title }: Props) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])

  const commit = () => {
    if (text !== value) onCommit(text)
  }

  return (
    <input
      className={`cell ${align === 'right' ? 'num' : ''} ${className ?? ''}`}
      value={text}
      placeholder={placeholder}
      title={title}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setText(value)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}
