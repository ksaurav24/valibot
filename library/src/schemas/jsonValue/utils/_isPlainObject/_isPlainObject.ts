/**
 * Checks whether a prototype chain terminates in `null` within one more
 * hop, which every realm's real `Object.prototype` does (its own
 * prototype is `null`), and no other built-in or class prototype does,
 * since they all (directly or transitively) inherit from
 * `Object.prototype`.
 *
 * Hint: `proto` or a prototype further up its chain may be a `Proxy`
 * whose `getPrototypeOf` trap throws. Such a failure is treated as the
 * chain not terminating in `null`, so a hostile prototype cannot abort
 * validation.
 *
 * @param proto The prototype to check, or `null`.
 *
 * @returns Whether the prototype chain is plain-object-shaped.
 */
function _isPlainPrototype(proto: object | null): boolean {
  try {
    return proto === null || Object.getPrototypeOf(proto) === null;
  } catch {
    return false;
  }
}

/**
 * Checks whether an object is a plain object, in a way that also accepts a
 * plain object created in another JavaScript realm (for example another
 * `vm` context or iframe), since such an object has a different
 * `Object.prototype` reference despite being JSON-shaped and serializable.
 *
 * Hint: Rather than comparing `Object.getPrototypeOf(input)` against this
 * realm's `Object.prototype` by reference, or reading the prototype's
 * `constructor` property (which may be a throwing getter or a reassigned,
 * spoofable value), this checks the shape of the prototype chain itself:
 * `input` is treated as a plain object if and only if its prototype is
 * `null` (for example `Object.create(null)`) or its prototype's prototype
 * is `null`.
 *
 * Hint: This is a heuristic, not a sound check, and is not attacker-proof.
 * It can be defeated by a `Proxy` whose `getPrototypeOf` trap fakes a
 * shorter chain (for example making a `Map` or `Date` report a `null`
 * prototype), or by an object whose real prototype chain was deliberately
 * shortened (for example `Object.setPrototypeOf(Foo.prototype, null)`).
 * Both require the caller's own code, or code it already trusted enough to
 * run in the same realm, to construct such a value; there is no
 * in-language check that can be relied on against that threat model. This
 * check only guards against ordinary, non-adversarial inputs, such as a
 * `Date` or class instance passed in by mistake.
 *
 * @param input The object to check.
 *
 * @returns Whether the object is a plain object.
 *
 * @internal
 */
// @__NO_SIDE_EFFECTS__
export function _isPlainObject(input: object): boolean {
  try {
    return _isPlainPrototype(Object.getPrototypeOf(input) as object | null);
  } catch {
    return false;
  }
}
