declare module 'connect-sqlite3' {
  import session from 'express-session';

  interface SQLiteStoreOptions {
    db?: string;
    dir?: string;
    table?: string;
    concurrentDB?: boolean;
  }

  function connectSqlite3(
    session: typeof import('express-session')
  ): new (options?: SQLiteStoreOptions) => session.Store;

  export = connectSqlite3;
}
