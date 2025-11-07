import axios from "axios";
import { config } from "../constants/config.js";

/**
 * @description Send a text message to the specific phone number.
 */
export async function sendMessage(message: string, phone_number: string) {
  try {
    await axios.post(
      "https://sms.iprogtech.com/api/v1/sms_messages",
      {},
      {
        headers: {
          "Content-Type": "application/json",
        },
        params: {
          api_token: config.sms.smsApiKey,
          phone_number,
          message,
          sms_provider: 1,
        },
      }
    );

    console.log(`Sms message sent to ${phone_number} successfully.`);
  } catch (error) {
    throw new Error("Failed sending sms notification.");
  }
}
