#!/bin/bash

# Reset environment variables if they are already set
unset DB_HOST DB_NAME DB_NAME_LOCAL DB_USER DB_PASSWORD LOCAL_USER

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --help, -h    Show this help message"
            echo ""
            echo "This script restores the database from the dump file created by clone_db.sh"
            echo "Make sure to run clone_db.sh first to create the dump file."
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Load environment variables from .env file
if [ -f ".env" ]; then
    echo "Loading environment variables from .env file..."
    export $(cat .env | grep -v '^#' | xargs)
else
    echo "ERROR: .env file not found. Please create a .env file with the following variables:"
    echo "DB_HOST=your_host"
    echo "DB_NAME=your_database_name"
    echo "DB_NAME_LOCAL=your_local_database_name"
    echo "DB_USER=your_username"
    echo "DB_PASSWORD=your_password"
    echo "LOCAL_USER=your_local_postgres_user"
    exit 1
fi

# Validate required environment variables
if [ -z "$DB_NAME_LOCAL" ] || [ -z "$LOCAL_USER" ]; then
    echo "ERROR: Missing required environment variables. Please check your .env file contains:"
    echo "DB_NAME_LOCAL, LOCAL_USER"
    exit 1
fi

# Check if dump file exists
if [ ! -f "./db_backups/complete_dump.sql" ]; then
    echo "ERROR: Dump file not found at ./db_backups/complete_dump.sql"
    echo "Please run clone_db.sh first to create the dump file."
    exit 1
fi

echo "===== Starting database restoration process ====="

# Step 0: Replace all instances of the original database name with the local database name
echo "Updating database name references in dump file..."

# Check if DB_NAME is a substring of DB_NAME_LOCAL to prevent multiple replacements
if [[ "$DB_NAME_LOCAL" == *"$DB_NAME"* ]]; then
    echo "ERROR: DB_NAME_LOCAL ($DB_NAME_LOCAL) contains DB_NAME ($DB_NAME) as a substring."
    echo "This would cause replacement loops across multiple script runs. Please use different database names."
    echo "Example: If DB_NAME is 'foil', DB_NAME_LOCAL should not be 'foil_local' or 'my_foil_db'"
    exit 1
fi

# Replace all instances of the original database name with the local database name
# This handles cases where the dump contains references to the original database name
sed -i "s/$DB_NAME/$DB_NAME_LOCAL/g" ./db_backups/complete_dump.sql

# Step 1: Drop and recreate local database
echo "Dropping and recreating local database..."
psql -U $LOCAL_USER -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME_LOCAL';"
psql -U $LOCAL_USER -c "DROP DATABASE IF EXISTS $DB_NAME_LOCAL;"  
psql -U $LOCAL_USER -c "DROP DATABASE IF EXISTS temp_connection_db;"
psql -U $LOCAL_USER -c "CREATE DATABASE $DB_NAME_LOCAL;"
psql -U $LOCAL_USER -c "CREATE DATABASE temp_connection_db;"

# Step 2: Restore the database
echo "Restoring database to local server..."
psql -U $LOCAL_USER -d temp_connection_db -f ./db_backups/complete_dump.sql

# Step 3: Manually reset sequences to match current data
echo "Manually resetting sequences..."
psql -U $LOCAL_USER -d $DB_NAME_LOCAL <<EOF
DO \$\$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT
      table_name,
      column_name,
      pg_get_serial_sequence(table_name, column_name) as seq_name
    FROM
      information_schema.columns
    WHERE
      table_schema = 'public'
      AND column_default LIKE 'nextval%'
  ) LOOP
    IF r.seq_name IS NOT NULL THEN
      EXECUTE format(
        'SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I.%I), 1))',
        r.seq_name, r.column_name, 'public', r.table_name
      );
    END IF;
  END LOOP;
END \$\$;
EOF

psql -U $LOCAL_USER -c "DROP DATABASE temp_connection_db;"

echo "===== Database restoration completed ====="
echo "Your production database has been copied to your local PostgreSQL server."
echo "Use the following connection string in your .env file:"
echo "DATABASE_URL=postgresql://$LOCAL_USER@localhost:5432/$DB_NAME_LOCAL" 