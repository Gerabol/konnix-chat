import { lazy, Suspense } from 'react'

export type EmojiSelection = {
  native?: string
}

export type LazyEmojiPickerProps = {
  onEmojiSelect: (emoji: EmojiSelection) => void
  previewPosition?: 'none' | 'top' | 'bottom'
  skinTonePosition?: 'none' | 'preview' | 'search'
}

const EmojiMartPicker = lazy(async () => {
  const [{ default: data }, { default: Picker }] = await Promise.all([
    import('@emoji-mart/data'),
    import('@emoji-mart/react'),
  ])
  return {
    default: function EmojiPickerComponent(props: LazyEmojiPickerProps) {
      return (
        <Picker
          data={data}
          onEmojiSelect={props.onEmojiSelect}
          previewPosition={props.previewPosition ?? 'none'}
          skinTonePosition={props.skinTonePosition ?? 'none'}
        />
      )
    },
  }
})

export function LazyEmojiPicker(props: LazyEmojiPickerProps) {
  return (
    <Suspense fallback={<div className="emoji-picker-loading" style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>Carregando emojis…</div>}>
      <EmojiMartPicker {...props} />
    </Suspense>
  )
}

export default LazyEmojiPicker
