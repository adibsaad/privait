#!/usr/bin/env bash

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

CREATE_DB_SQL=$(<$DIR/sql/create_db.sql)
CREATE_TEST_DB_SQL=$(<$DIR/sql/create_test_db.sql)
BOOTSTRAP_SQL=$(<$DIR/sql/bootstrap.sql)

runSqlCommand() {
  db=$1
  shift
  docker-compose exec postgres psql postgresql://postgres:postgres@localhost:5432/$db -c "$*"
}

runSqlCommand "postgres" $CREATE_DB_SQL
runSqlCommand "postgres" $CREATE_TEST_DB_SQL

runSqlCommand "privait_dev" $BOOTSTRAP_SQL
runSqlCommand "privait_test" $BOOTSTRAP_SQL
