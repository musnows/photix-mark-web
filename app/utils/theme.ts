export function preserveDialogOnThemeToggle(event: CustomEvent<{ originalEvent: Event }>) {
  const target = event.detail.originalEvent.target
  if (target instanceof Element && target.closest('[data-theme-toggle]')) event.preventDefault()
}
