type Vector = { x: number; y: number };

let joystick: Vector = { x: 0, y: 0 };

export const gameInput = {
  getJoystick(): Vector {
    return joystick;
  },
  setJoystick(next: Vector): void {
    joystick = next;
  },
  clearJoystick(): void {
    joystick = { x: 0, y: 0 };
  },
};
