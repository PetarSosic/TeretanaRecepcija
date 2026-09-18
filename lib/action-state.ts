// Doc 08 §6: every server action answers with a result the form can render. `data`
// carries what the caller needs next, such as the number of a member just created.
export type ActionState<T = undefined> = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  data?: T;
};

export const idleState: ActionState = {};
