#!/usr/bin/env bash

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

CREATE_DB_SQL=$(<$DIR/sql/create_db.sql)
CREATE_TEST_DB_SQL=$(<$DIR/sql/create_test_db.sql)

docker-compose exec postgres psql postgresql://postgres:postgres@localhost:5432/postgres -c "$CREATE_DB_SQL"
docker-compose exec postgres psql postgresql://postgres:postgres@localhost:5432/postgres -c "$CREATE_TEST_DB_SQL"
