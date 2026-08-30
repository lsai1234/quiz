import { accessesForMember, logMemberAccess } from '../access-log'
import { getEngine } from '@/lib/db/engine'
import { createUser } from '@/lib/db/users'
import { deleteAccount, exportAccount } from '@/lib/db/erasure'

describe('the member access log', () => {
  it('records who opened whose record, and when', async () => {
    await logMemberAccess({ founderEmail: 'ada@chrgd.dev', userId: 'u1', kind: 'member-record' })

    const [entry] = await accessesForMember('u1')
    expect(entry.founder).toBe('ada@chrgd.dev')
    expect(entry.userId).toBe('u1')
    expect(entry.kind).toBe('member-record')
    expect(entry.at).toBeTruthy()
  })

  it('records nothing about what was on screen', async () => {
    // Logging the contents would make the audit log a second copy of the data
    // it exists to protect.
    await logMemberAccess({ founderEmail: 'ada@chrgd.dev', userId: 'u2', kind: 'member-record' })
    const db = await getEngine()
    const row = await db.get<Record<string, unknown>>(
      'SELECT * FROM member_access_log WHERE user_id = ?', ['u2'],
    )
    expect(Object.keys(row ?? {}).sort()).toEqual(
      ['created_at', 'founder', 'id', 'kind', 'path', 'user_id'],
    )
  })

  it('keeps one entry per access, newest first', async () => {
    await logMemberAccess({ founderEmail: 'ada@chrgd.dev', userId: 'u3', kind: 'member-record' })
    await logMemberAccess({ founderEmail: 'grace@chrgd.dev', userId: 'u3', kind: 'member-order' })

    const entries = await accessesForMember('u3')
    expect(entries).toHaveLength(2)
    expect(entries[0].at >= entries[1].at).toBe(true)
  })

  it('reads by member, not by founder', async () => {
    await logMemberAccess({ founderEmail: 'ada@chrgd.dev', userId: 'u4', kind: 'member-record' })
    await logMemberAccess({ founderEmail: 'ada@chrgd.dev', userId: 'u5', kind: 'member-record' })
    expect(await accessesForMember('u4')).toHaveLength(1)
  })

  it('never throws, whatever the database does', async () => {
    // A support screen that 500s because the audit write failed helps nobody.
    const db = await getEngine()
    const original = db.run.bind(db)
    jest.spyOn(db, 'run').mockImplementationOnce(async () => {
      throw new Error('write failed')
    })
    await expect(
      logMemberAccess({ founderEmail: 'ada@chrgd.dev', userId: 'u6', kind: 'member-record' }),
    ).resolves.toBeUndefined()
    db.run = original
  })

  it('survives the member being erased', async () => {
    // "Who looked at this record" is exactly the question asked after an
    // account is gone, which is why user_id is a plain column and not an FK.
    const user = await createUser({ email: 'watched@example.com', passwordHash: 'h' })
    await logMemberAccess({ founderEmail: 'ada@chrgd.dev', userId: user.id, kind: 'member-record' })

    await deleteAccount(user.id)
    expect(await accessesForMember(user.id)).toHaveLength(1)
  })
})

describe('what the member is told', () => {
  it('shows them that their record was opened, without naming the employee', async () => {
    const user = await createUser({ email: 'asks@example.com', passwordHash: 'h' })
    await logMemberAccess({ founderEmail: 'ada@chrgd.dev', userId: user.id, kind: 'member-record' })

    const data = await exportAccount(user.id)
    expect(data!.staffAccess).toHaveLength(1)
    expect(JSON.stringify(data!.staffAccess)).not.toContain('ada@chrgd.dev')
    expect(JSON.stringify(data!.staffAccess)).toContain('member-record')
  })
})
