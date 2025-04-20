-- In the AST, the table item has no location.
-- This test asserts that Citronella does not crash when an expression has no location.
print({ 'a' })
