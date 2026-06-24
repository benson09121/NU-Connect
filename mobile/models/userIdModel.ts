// @ts-nocheck
const Auth = {
  userId: null,
  firstname: null,
  lastname: null,

  set id(value) {
    this.userId = value;
  },
  set first_name(value) {
    this.firstname = value;
  },

  set last_name(value) {
    this.lastname = value;
  },  

  get get_first_name() {
    return this.firstname;
  },

  get get_last_name() {
    return this.lastname;
  },
  
  get get_userId() {
    return this.userId;
  },
};

module.exports = { Auth };
