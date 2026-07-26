-- Change user_quotas storage columns from INT4 to BIGINT.
-- INT4 can't hold the 5 GB default (5368709120 > 2147483647).
ALTER TABLE user_quotas ALTER COLUMN max_storage_bytes TYPE bigint;
ALTER TABLE user_quotas ALTER COLUMN used_storage_bytes TYPE bigint;
