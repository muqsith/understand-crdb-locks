SELECT
  txn_id,
  table_name,
  lock_key_pretty,
  lock_strength,
  ts AS lock_timestamp,
  now() - ts AS lock_age
FROM crdb_internal.cluster_locks
ORDER BY lock_age DESC;


CANCEL TRANSACTION '<txn_id>';