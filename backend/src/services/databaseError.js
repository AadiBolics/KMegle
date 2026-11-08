module.exports = function databaseError(error, env = process.env) {
  function clean(value) {
    let text = String(value || "Unknown database error");
    for (const secret of [env.DATABASE_URL, env.DATABASE_CA_CERT])
      if (secret) text = text.split(secret).join("[redacted]");
    return text
      .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, "[database URL redacted]")
      .replace(/-----BEGIN [\s\S]*?-----END [\s\S]*?-----/g, "[PEM redacted]")
      .replace(/\b(password|token|apiKey)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
      .replace(/[\r\n]+/g, " ")
      .slice(0, 600);
  }
  const result = {
    stage: error?.migrationStage || "startup",
    code: clean(error?.code || "UNKNOWN"),
    message: clean(error?.message),
  };
  if (error?.migrationFile) result.migration = clean(error.migrationFile);
  if (error?.cause)
    result.cause = {
      code: clean(error.cause.code || "UNKNOWN"),
      message: clean(error.cause.message),
    };
  if (error?.rollbackCode) result.rollbackCode = clean(error.rollbackCode);
  return result;
};
