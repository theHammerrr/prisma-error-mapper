-- Quoted identifiers preserve the requested constraint name, including spaces.
ALTER TABLE "Account"
  ADD CONSTRAINT "check normal email"
  CHECK ("email" NOT LIKE '123%');
