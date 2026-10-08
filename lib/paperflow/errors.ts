export function readableError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "QuotaExceededError") return "기기 저장 공간이 부족합니다. 공간을 확보한 뒤 다시 시도해 주세요. 원본 파일은 변경되지 않았습니다.";
  if (name === "PasswordException") return "암호화된 PDF입니다. 암호를 해제한 사본을 가져와 주세요.";
  if (name === "InvalidPDFException") return "PDF가 손상되었거나 지원되지 않는 형식입니다.";
  return error instanceof Error ? error.message : "작업에 실패했습니다. 다시 시도해 주세요.";
}
