import { common, Want } from '@kit.AbilityKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { webview } from '@kit.ArkWeb';
import {
  APP_URL,
  isExternalHttpsUrl,
  isTrustedAppUrl,
} from '../config/AppConfig';

@Entry
@Component
struct Index {
  private controller: webview.WebviewController =
    new webview.WebviewController();
  @State private loading: boolean = true;
  @State private failed: boolean = false;

  private retry(): void {
    this.failed = false;
    this.loading = true;

    try {
      this.controller.loadUrl(APP_URL);
    } catch (_error) {
      this.loading = false;
      this.failed = true;
    }
  }

  private openExternal(url: string): void {
    if (!isExternalHttpsUrl(url)) {
      this.loading = false;
      this.failed = true;
      return;
    }

    const context: common.UIAbilityContext =
      this.getUIContext().getHostContext() as common.UIAbilityContext;
    const want: Want = {
      action: 'ohos.want.action.viewData',
      uri: url,
    };

    context.startAbility(want).catch((_error: BusinessError): void => {
      this.loading = false;
      this.failed = true;
    });
  }

  onBackPress(): boolean {
    try {
      if (this.controller.accessBackward()) {
        this.controller.backward();
        return true;
      }
    } catch (_error) {
      return false;
    }

    return false;
  }

  build() {
    Stack({ alignContent: Alignment.Center }) {
      Web({ src: APP_URL, controller: this.controller })
        .width('100%')
        .height('100%')
        .javaScriptAccess(true)
        .domStorageAccess(true)
        .fileAccess(false)
        .mixedMode(MixedMode.None)
        .onPageBegin((): void => {
          this.loading = true;
          this.failed = false;
        })
        .onPageEnd((): void => {
          this.loading = false;
          this.failed = false;
        })
        .onErrorReceive((event): void => {
          if (event?.request.isMainFrame()) {
            this.loading = false;
            this.failed = true;
          }
        })
        .onOverrideUrlLoading((event): boolean => {
          const url: string = event.getRequestUrl();
          if (isTrustedAppUrl(url)) {
            return false;
          }

          this.openExternal(url);
          return true;
        })

      if (this.loading && !this.failed) {
        Column({ space: 16 }) {
          LoadingProgress()
            .width(44)
            .height(44)
            .color($r('app.color.brand'))
          Text($r('app.string.loading_message'))
            .fontSize(16)
            .fontColor($r('app.color.muted'))
        }
        .justifyContent(FlexAlign.Center)
        .width('100%')
        .height('100%')
        .backgroundColor($r('app.color.shell_background'))
      }

      if (this.failed) {
        Column({ space: 14 }) {
          Text($r('app.string.error_title'))
            .fontSize(22)
            .fontWeight(FontWeight.Bold)
            .fontColor($r('app.color.brand'))
            .textAlign(TextAlign.Center)
          Text($r('app.string.error_message'))
            .fontSize(15)
            .fontColor($r('app.color.muted'))
            .textAlign(TextAlign.Center)
          Button($r('app.string.retry'))
            .fontSize(16)
            .fontColor($r('app.color.surface'))
            .backgroundColor($r('app.color.brand'))
            .onClick((): void => {
              this.retry();
            })
        }
        .justifyContent(FlexAlign.Center)
        .padding(32)
        .width('100%')
        .height('100%')
        .backgroundColor($r('app.color.shell_background'))
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor($r('app.color.shell_background'))
  }
}
