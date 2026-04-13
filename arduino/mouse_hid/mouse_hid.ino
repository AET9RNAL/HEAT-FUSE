/*
 * mouse_hid.ino — Arduino Pro Micro (ATmega32U4) HID Mouse Injector
 *
 * Receives 5-byte packets over Serial (115200 baud) from Python
 * and translates them into real USB HID mouse events.
 *
 * Protocol (per packet):
 *   Byte 0:    CMD   (0x01=move, 0x02=click, 0x03=btn_down, 0x04=btn_up)
 *   Byte 1-2:  X     (int16, little-endian)  — relative X delta
 *   Byte 3-4:  Y     (int16, little-endian)  — relative Y delta
 *
 * Board setup:
 *   Arduino IDE → Tools → Board → "Arduino Leonardo"
 *   Tools → Port → (your COM port)
 *
 * Upload, done. No libraries to install — Mouse.h is built-in.
 */

#include <Mouse.h>

#define CMD_MOVE      0x01
#define CMD_CLICK     0x02
#define CMD_LEFT_DOWN 0x03
#define CMD_LEFT_UP   0x04

#define PACKET_SIZE   5
#define BAUD_RATE     115200

static uint8_t buf[PACKET_SIZE];

void setup() {
    Serial.begin(BAUD_RATE);
    Mouse.begin();
}

void loop() {
    if (Serial.available() < PACKET_SIZE) return;

    Serial.readBytes(buf, PACKET_SIZE);

    uint8_t cmd = buf[0];
    int16_t x   = (int16_t)(buf[1] | (buf[2] << 8));
    int16_t y   = (int16_t)(buf[3] | (buf[4] << 8));

    switch (cmd) {
        case CMD_MOVE:
            // Mouse.move() accepts -128..127 per axis per call.
            // Python side already chunks large deltas, but clamp anyway.
            Mouse.move(constrain(x, -128, 127),
                       constrain(y, -128, 127), 0);
            break;

        case CMD_CLICK:
            Mouse.click(MOUSE_LEFT);
            break;

        case CMD_LEFT_DOWN:
            Mouse.press(MOUSE_LEFT);
            break;

        case CMD_LEFT_UP:
            Mouse.release(MOUSE_LEFT);
            break;

        default:
            break;  // unknown cmd — ignore
    }
}
