import { useState, type FormEvent } from 'react'
import { REPORT_REASONS, type ReportReason, type ReportTargetType } from '@/types'
import { safetyApi, toErrorMessage } from '@/services'
import { useToast } from '@/context/ToastContext'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { SelectField, TextAreaField } from '@/components/ui/Field'

interface ReportModalProps {
  open: boolean
  onClose: () => void
  actorId: string
  targetType: ReportTargetType
  targetId: string
  /** Display name of what's being reported, for the copy. */
  targetLabel: string
}

/**
 * Report a listing or a user (Phase 8). Writes to the moderation
 * queue; moderators review from /moderation (admins) or the console.
 */
export function ReportModal({
  open,
  onClose,
  actorId,
  targetType,
  targetId,
  targetLabel,
}: ReportModalProps) {
  const { push } = useToast()
  const [reason, setReason] = useState<ReportReason>('scam')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await safetyApi.createReport(actorId, {
        targetType,
        targetId,
        reason,
        details: details.trim() || undefined,
      })
      push({
        title: 'Report sent',
        body: 'Thanks — a moderator will take a look.',
        tone: 'success',
        emoji: '🛡️',
      })
      onClose()
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Report ${targetType === 'listing' ? 'listing' : 'user'}`}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-bark-light">
          Reporting <strong className="text-bark">{targetLabel}</strong>. Reports are anonymous to
          the other user — only moderators see who sent them.
        </p>
        <SelectField
          label="What's wrong?"
          value={reason}
          onChange={(e) => setReason(e.target.value as ReportReason)}
        >
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </SelectField>
        <TextAreaField
          label="Details (optional)"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Anything a moderator should know…"
        />
        {error && (
          <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Send report
          </Button>
        </div>
      </form>
    </Modal>
  )
}
