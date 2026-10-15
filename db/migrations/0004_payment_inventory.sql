-- Temporary token makes payment confirmation and inventory decrement idempotent.
ALTER TABLE payment_orders ADD COLUMN inventory_update_token TEXT;
