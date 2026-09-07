'use client'

import { createAuthClient } from 'better-auth/react'

/**
 * The browser half of the account system.
 *
 * No `baseURL`: the client posts to `/api/auth` on whatever origin served the
 * page, which is the only origin it should ever talk to. Naming one here would
 * be a value to get wrong between development and the deployment, and a wrong
 * one sends credentials somewhere else.
 */
export const authClient = createAuthClient()
