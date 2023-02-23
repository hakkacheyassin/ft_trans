import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Redirect,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { authenticator } from 'otplib';
import { Jwt2faGuard, JwtGuard } from './guards';
import { TwoFactDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('/redirect')
  @Redirect(
    'https://api.intra.42.fr/oauth/authorize?client_id=u-s4t2ud-8dac923a7faa5e271e7a48b1823cd099d6b981eb5193dca17613e24b4cd72ca5&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth&response_type=code',
    301,
  )
  redirect() {}

  @Get('')
  async getToken(@Query() obj) {
    const data = await this.authService.fetch_data(obj.code);
    const user = await this.authService.create_user(data);
    return this.authService.signToken(user.id, !!user.tfa);
  }

  @Get('qrcode')
  @UseGuards(JwtGuard)
  async generateQrCode(@Req() req: Request) {
    const tf_auth_obj = await this.authService.generate_2f_auth(req.user);
    return {
      qr: await this.authService.generateQrCodeDataURL(tf_auth_obj.otpauthUrl),
      secret: tf_auth_obj.secret,
    };
  }

  @UsePipes(new ValidationPipe())
  @Post('2fa/turn-on')
  @UseGuards(JwtGuard)
  async turn_on_2f_auth(@Req() req: Request, @Body() body: TwoFactDto) {
    const isCodeValid = this.authService.isTwoFactorAuthenticationCodeValid(
      body.twoFactorAuthenticationCode,
      body.secret,
    );
    if (!isCodeValid) {
      throw new UnauthorizedException('Wrong authentication code');
    }
    return this.authService.turnOnTwoFactorAuthentication(req.user, body.secret);
  }

  @Get('2fa/turn-off')
  @UseGuards(JwtGuard)
  async turn_off_2f_auth(@Req() req: Request) {
    return this.authService.turnOffTwoFactorAuthentication(req.user);
  }

  @Post('2fa/authenticate')
  @HttpCode(200)
  @UseGuards(JwtGuard)
  async authenticate(@Req() req, @Body() body) {
    return this.authService.authenticate2f(req.user, body);
  }

  @Get('2frequired')
  @UseGuards(Jwt2faGuard)
  async test() {
    return 'Successfully authenticated with 2F';
  }

  @Get('2fnotrequired')
  @UseGuards(JwtGuard)
  async test2() {
    return 'Successfully authenticated without 2F';
  }
}