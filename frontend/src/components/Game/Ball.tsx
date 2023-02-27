export interface Ball {
  x: number;
  y: number;
  radius: number;
  speed: number;
  velocityX: number;
  velocityY: number;
  color: string;
  stop: boolean;
}

export function createBall(canvas: HTMLCanvasElement): Ball {
  let ball: Ball = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 20,
    speed: 50,
    velocityX: 0,
    velocityY: 0,
    color: "WHITE",
    stop: false,
  };
  if (Math.random() > 0.5) ball.velocityX = 5;
  else ball.velocityX = -5;
  while (ball.velocityY * 10 < 20 && ball.velocityY * 10 > -20) {
    if (Math.random() > 0.5) ball.velocityY = (Math.random() * 10) % 5;
    else ball.velocityY = (Math.random() * 10) % 5;
    console.log(ball.velocityY * 10);
  }

  return ball;
}
