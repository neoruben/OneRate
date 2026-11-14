plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.onerate.app"
    compileSdk {
        version = release(37) {
            minorApiLevel = 2
        }
    }

    defaultConfig {
        applicationId = "io.github.neoruben.onerate"
        minSdk = 26
        targetSdk = 37
        versionCode = 5
        versionName = "1.0.4"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        ndk { abiFilters += "arm64-v8a" }
    }

    buildTypes {
        release {
            // Sin optimización (R8): con GeckoView eliminaba código necesario y la app se cerraba al abrirla
            optimization {
                enable = false
                packageScope = setOf("androidx.**", "kotlin.**", "kotlinx.**")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    // Librerías nativas (casi todo es el motor de Firefox) comprimidas dentro del APK:
    // el archivo a descargar ocupa aproximadamente la mitad
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }
}

dependencies {
    implementation("org.mozilla.geckoview:geckoview:159.0.20261102144711")

    // Sin Jetpack Compose (la app no lo usa): solo lo imprescindible de AndroidX
    implementation("androidx.activity:activity-ktx:1.8.0")
    implementation(libs.androidx.core.ktx)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
}

configurations.all {
    resolutionStrategy.eachDependency {
        if (requested.group == "org.jetbrains.kotlin" && requested.name.startsWith("kotlin-stdlib")) {
            useVersion("2.2.0")
        }
    }
}