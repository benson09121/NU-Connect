// Ambient declaration — no imports allowed here, otherwise this file becomes a
// module and the global augmentation stops working for ts-node.
declare namespace Express {
  interface Request {
    user?: {
      user_id?: string;
      email?: string;
      first_name?: string;
      last_name?: string;
      f_name?: string;
      l_name?: string;
      role?: string;
      program_id?: string | number;
      program_name?: string;
      permissions?: string[];
      organizations?: any[];
      pending_application?: any;
      azureSub?: string;
    };
    userId?: string;
  }
}
