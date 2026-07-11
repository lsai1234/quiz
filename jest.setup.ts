import '@testing-library/jest-dom'

// Tests hit an in-memory database instead of .data/chrgd.db.
process.env.DATABASE_PATH = ':memory:'
