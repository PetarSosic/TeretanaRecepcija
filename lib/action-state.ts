// Doc 08 §6: every server action answers with a result the form can render.
export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
};

export const idleState: ActionState = {};
