import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/utils/cn'

/**
 * Form primitives with a consistent, warm look and REAL error states:
 * labels are always visible, errors are announced (role=alert) and tied to
 * inputs with aria-invalid + aria-describedby. Never just disable a button
 * and hope the user guesses why.
 */

const CONTROL_BASE =
  'w-full rounded-2xl border bg-surface px-3.5 py-2.5 text-sm text-bark placeholder:text-bark-light/75 transition-colors outline-offset-1 focus-visible:outline-2 focus-visible:outline-terracotta-600'

const controlTone = (invalid: boolean) =>
  invalid ? 'border-red-400 bg-red-50/40 dark:bg-red-950/60' : 'border-bark/15 hover:border-bark/25'

export interface FieldShellProps {
  label: string
  htmlFor: string
  error?: string | undefined
  hint?: string | undefined
  required?: boolean
  children: ReactNode
  className?: string
}

function FieldShell({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-semibold text-bark">
        {label}
        {required && (
          <span aria-hidden className="ml-1 text-terracotta-600 dark:text-terracotta-400">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-xs text-bark-light">
          {hint}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string | undefined
  hint?: string | undefined
}

export function TextField({ label, error, hint, className, id, ...rest }: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const invalid = Boolean(error)
  return (
    <FieldShell label={label} htmlFor={inputId} error={error} hint={hint} required={rest.required}>
      <input
        id={inputId}
        className={cn(CONTROL_BASE, controlTone(invalid), className)}
        aria-invalid={invalid || undefined}
        aria-describedby={error ? undefined : hint ? `${inputId}-hint` : undefined}
        {...rest}
      />
    </FieldShell>
  )
}

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string | undefined
  hint?: string | undefined
}

export function TextAreaField({
  label,
  error,
  hint,
  className,
  id,
  rows = 4,
  ...rest
}: TextAreaFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const invalid = Boolean(error)
  return (
    <FieldShell label={label} htmlFor={inputId} error={error} hint={hint} required={rest.required}>
      <textarea
        id={inputId}
        rows={rows}
        className={cn(CONTROL_BASE, 'resize-y', controlTone(invalid), className)}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    </FieldShell>
  )
}

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  error?: string | undefined
  hint?: string | undefined
  children: ReactNode
}

export function SelectField({
  label,
  error,
  hint,
  className,
  id,
  children,
  ...rest
}: SelectFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const invalid = Boolean(error)
  return (
    <FieldShell label={label} htmlFor={inputId} error={error} hint={hint} required={rest.required}>
      <select
        id={inputId}
        className={cn(CONTROL_BASE, 'cursor-pointer', controlTone(invalid), className)}
        aria-invalid={invalid || undefined}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  )
}
