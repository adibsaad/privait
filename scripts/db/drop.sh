#!/usr/bin/env bash

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

DROP_DB_SQL=$(<$DIR/sql/drop_db.sql)
DROP_TEST_DB_SQL=$(<$DIR/sql/drop_test_db.sql)

docker-compose exec postgres psql postgresql://postgres:postgres@localhost:5432/postgres -c "$DROP_DB_SQL"
docker-compose exec postgres psql postgresql://postgres:postgres@localhost:5432/postgres -c "$DROP_TEST_DB_SQL"
