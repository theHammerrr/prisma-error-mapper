ALTER TABLE "Account"
  DROP CONSTRAINT IF EXISTS "check normal email";

ALTER TABLE "Account"
  ADD CONSTRAINT "check normal email"
  CHECK ("email" NOT LIKE '123%');

ALTER TABLE "Payment"
  DROP CONSTRAINT IF EXISTS "payment amount positive";

ALTER TABLE "Payment"
  ADD CONSTRAINT "payment amount positive"
  CHECK ("amount" > 0);
