'use client'

import { useState } from 'react'
import { deleteAccount } from '@/app/actions/deleteAccount'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

const CONFIRMATION = 'DELETE'

export default function DeleteAccount() {
  const [confirming, setConfirming] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setError(null)
    setDeleting(true)
    try {
      await deleteAccount(phrase)
    } catch (err) {
      // A successful delete redirects, so reaching here means it failed.
      setError(err instanceof Error ? err.message : 'Failed to delete account')
      setDeleting(false)
    }
  }

  return (
    <section className="mt-6 rounded-[14px] border border-[#fecaca] bg-white p-5">
      <h2 className="font-[600] text-[#b91c1c]">Delete account</h2>
      <p className="mt-1 text-sm text-[#71717a]">
        Permanently deletes your account and everything in it — meals, chat history, training,
        recovery, measurements, targets, and your Telegram link. This cannot be undone.
      </p>

      {confirming ? (
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="delete-confirm">
              Type {CONFIRMATION} to confirm
            </Label>
            <Input
              id="delete-confirm"
              value={phrase}
              autoComplete="off"
              onChange={(e) => setPhrase(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-[#b91c1c]">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={handleDelete}
              disabled={phrase.trim() !== CONFIRMATION || deleting}
              className="bg-[#b91c1c] text-white hover:bg-[#991b1b]"
            >
              {deleting ? 'Deleting…' : 'Permanently delete'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirming(false)
                setPhrase('')
                setError(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="mt-4 border-[#fecaca] text-[#b91c1c] hover:bg-[#fef2f2]"
          onClick={() => setConfirming(true)}
        >
          Delete account
        </Button>
      )}
    </section>
  )
}
