import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { request } from '@playwright/test'

import { SHARED_FILE, SHARED_NAMES, signUp } from './accounts.js'
import type { TestAccount } from './accounts.js'

/**
 * Signs up the run's shared accounts once, before any spec (review of #240). The API allows 30 sign-ups
 * and 20 sign-ins per address per hour, and the live smoke test runs after every merge: with one account
 * per person per test, two merges in an hour were refused (429). Specs take these with shared(name),
 * each building and deleting its own household; only tests that change an account (name, password,
 * status, gender, photo) or sign up in the page make their own. Nobody signs in again: the session that
 * signing up returns is put in the page (signInPage), so the sign-in limit is never touched.
 */
export default async function globalSetup() {
  // The free API may be asleep: the first sign-up can wait about a minute
  const api = await request.newContext({ timeout: 120_000 })
  try {
    const accounts: Record<string, TestAccount> = {}
    for (const name of SHARED_NAMES) accounts[name] = await signUp(api, name)
    mkdirSync(dirname(SHARED_FILE), { recursive: true })
    writeFileSync(SHARED_FILE, JSON.stringify(accounts))
  } finally {
    await api.dispose()
  }
}
