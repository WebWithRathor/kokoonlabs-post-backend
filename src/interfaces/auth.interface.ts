export interface IPhonePayload {
  code: string;
  number: string;
}

export interface ISendOtpPayload {
  phone: IPhonePayload;
  isRegister?: boolean;
}

export interface ILoginWithOtpPayload {
  phone: IPhonePayload;
  otp: string;
}

export interface IRegisterPayload {
  name: {
    firstName: string;
    lastName?: string;
  };
  mobileNumber: string;
  otp: string;
}
