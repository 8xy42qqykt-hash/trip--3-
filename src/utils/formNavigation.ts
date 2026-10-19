import React from 'react';

/**
 * Handles Enter key navigation across form input fields.
 * If user presses Enter on an input field:
 * - If there is a next editable input field in the form, move focus to it.
 * - If it is the last input field, submit the form (or call onLastSubmit callback).
 */
export function handleEnterKeyNavigation(
  e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  options?: {
    onLastSubmit?: () => void;
    skipSelector?: string;
  }
) {
  if (e.key !== 'Enter' || e.shiftKey) return;

  const currentElement = e.currentTarget;
  const form = currentElement.form || currentElement.closest('form');
  if (!form) {
    if (options?.onLastSubmit) {
      e.preventDefault();
      options.onLastSubmit();
    }
    return;
  }

  // Find all focusable input elements in the form
  const selector = options?.skipSelector
    ? `input:not([type="hidden"]):not([disabled])${options.skipSelector}`
    : 'input:not([type="hidden"]):not([disabled]), textarea:not([disabled])';

  const elements = Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector)).filter(
    (el) => el.offsetParent !== null && !el.readOnly
  );

  const currentIndex = elements.indexOf(currentElement);
  if (currentIndex >= 0 && currentIndex < elements.length - 1) {
    // Focus next input field
    e.preventDefault();
    const nextElement = elements[currentIndex + 1];
    nextElement.focus();
    if (nextElement instanceof HTMLInputElement && nextElement.type === 'text') {
      nextElement.select?.();
    }
  } else if (currentIndex === elements.length - 1) {
    // Last input field - submit the form or call callback
    e.preventDefault();
    if (options?.onLastSubmit) {
      options.onLastSubmit();
    } else if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }
  }
}
