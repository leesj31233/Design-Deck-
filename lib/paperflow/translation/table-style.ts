/**
 * A table entry ends in a noun (개조식). The model sometimes still closes a cell like a sentence:
 * "…제공한다" → "…제공함", "…수 있다" → "…수 있음".
 */
export function tableEnding(text: string) {
  return text.replace(/(있|없)다$/, "$1음").replace(/이다$/, "임").replace(/한다$/, "함").replace(/된다$/, "됨").replace(/갖는다$/, "가짐").replace(/준다$/, "줌").replace(/진다$/, "짐");
}
