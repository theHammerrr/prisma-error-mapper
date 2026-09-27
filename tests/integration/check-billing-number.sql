ALTER TABLE "billing"."BillingConstraint"
  ADD CONSTRAINT "billing number positive"
  CHECK ("number" > 0);
